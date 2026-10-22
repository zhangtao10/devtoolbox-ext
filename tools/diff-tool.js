import { el, on, h, store, showError, parseErrorView, jumpTo, createWorkerRunner, createHistory, historyMenu } from './ui.js';

const SAMPLE_L = { id: 1, name: 'Alice', roles: ['admin', 'dev'], profile: { age: 30, city: 'Beijing' }, active: true };
const SAMPLE_R = { id: 1, name: 'Alice Wang', roles: ['admin'], profile: { age: 31, city: 'Beijing', email: 'a@x.com' }, active: true };

const CONTEXT = 3; // “仅显示差异行”时保留的上下文行数
const ROW_H = 21; // 虚拟列表固定行高（需与 CSS 一致）
const OVERSCAN = 20;
const LIST_LIMIT = 1000; // 差异列表最多渲染条数

export function initDiff(section) {
  const left = el(section, 'left');
  const right = el(section, 'right');
  const errBox = el(section, 'error');
  const result = el(section, 'result');
  const sideBox = el(section, 'side');
  const listBox = el(section, 'list');
  const summary = el(section, 'summary');
  const opt = (n) => section.querySelector(`[data-opt="${n}"]`);
  const runInWorker = createWorkerRunner();
  const side = createVirtualSide(sideBox);
  let rows = null;

  const history = createHistory('diff.history');
  store.remove('diff.left'); // 旧版本保存的上次输入，打开时不再恢复
  store.remove('diff.right');

  function setView(v) {
    section.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
    sideBox.hidden = v !== 'side';
    listBox.hidden = v !== 'list';
    if (v === 'side') side.refresh();
  }
  section.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

  async function compare() {
    for (const [ta, name] of [[left, '左侧'], [right, '右侧']]) {
      if (!ta.value.trim()) {
        showError(errBox, `${name}为空`);
        result.hidden = true;
        return;
      }
    }
    summary.replaceChildren(h('span', { class: 'badge' }, '对比中…'));
    let r;
    try {
      r = await runInWorker('diff', {
        left: left.value,
        right: right.value,
        loose: opt('loose').checked,
        sort: opt('sort').checked,
      });
    } catch (e) {
      if (!e.superseded) showError(errBox, `对比失败：${e.message}`);
      return;
    }
    if (!r.ok) {
      const ta = r.side === 'left' ? left : right;
      showError(errBox, [`${r.side === 'left' ? '左侧' : '右侧'}：`, ...parseErrorView(ta.value, r, () => jumpTo(ta, r.pos))]);
      result.hidden = true;
      return;
    }
    showError(errBox, null);
    history.put(null, { left: left.value, right: right.value });

    const { diffs } = r;
    const count = (t) => diffs.filter((d) => d.type === t).length;
    summary.replaceChildren(
      ...(diffs.length
        ? [
            h('span', { class: 'badge add' }, `+${count('added')} 新增`),
            ' ',
            h('span', { class: 'badge del' }, `−${count('removed')} 删除`),
            ' ',
            h('span', { class: 'badge chg' }, `~${count('changed')} 修改`),
            r.approx ? h('span', { class: 'muted', title: '差异过多时逐行对照会合并为整块，差异列表不受影响' }, ' · 逐行对照为近似结果') : null,
          ]
        : [h('span', { class: 'badge ok' }, '✓ 两侧 JSON 语义完全相同')]
      ).filter(Boolean)
    );
    renderList(listBox, diffs);
    rows = r.rows;
    result.hidden = false;
    side.setRows(rows, opt('only').checked);
  }

  on(section, 'compare', compare);
  on(section, 'swap', () => {
    [left.value, right.value] = [right.value, left.value];
    compare();
  });
  on(section, 'sample', () => {
    left.value = JSON.stringify(SAMPLE_L, null, 2);
    right.value = JSON.stringify(SAMPLE_R, null, 2);
    compare();
  });
  on(section, 'clear', () => {
    left.value = right.value = '';
    result.hidden = true;
    showError(errBox, null);
  });
  opt('only').addEventListener('change', () => rows && side.setRows(rows, opt('only').checked));
  opt('sort').addEventListener('change', () => !result.hidden && compare());
  opt('loose').addEventListener('change', () => !result.hidden && compare());
  section.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') compare();
  });
  historyMenu(el(section, 'history'), history, {
    preview: (d) => `${d.left.slice(0, 120)}  ⇄  ${d.right.slice(0, 120)}`,
    onPick: (d) => {
      left.value = d.left;
      right.value = d.right;
      compare();
    },
    empty: '暂无历史，对比成功后自动记录',
  });
  setView('side');
}

// 虚拟滚动的左右对照视图：只渲染可视区域内的行，任意行数都流畅。
// rows 元素格式：[type, 左行号, 左文本, 右行号, 右文本]，行号为 0 表示该侧为空。
function createVirtualSide(box) {
  const spacer = h('div', { class: 'vs-spacer' });
  box.replaceChildren(spacer);
  let rows = [];
  let items = []; // 行下标，或折叠块 { fold: [start, end) }
  let rendered = new Map(); // item 下标 -> 元素

  function buildItems(onlyDiff) {
    if (!onlyDiff) return rows.map((_, i) => i);
    const keep = new Uint8Array(rows.length);
    rows.forEach((r, i) => {
      if (r[0] === 'same') return;
      for (let j = Math.max(0, i - CONTEXT); j <= Math.min(rows.length - 1, i + CONTEXT); j++) keep[j] = 1;
    });
    const out = [];
    for (let i = 0; i < rows.length; ) {
      if (keep[i]) {
        out.push(i++);
        continue;
      }
      const start = i;
      while (i < rows.length && !keep[i]) i++;
      out.push({ fold: [start, i] });
    }
    return out;
  }

  function cell(no, text, cls) {
    const tx = h('span', { class: 'tx' }, text);
    if (text.length > 80) tx.title = text;
    return [h('span', { class: `no ${cls}` }, no ? String(no) : ''), h('span', { class: `tx-wrap ${cls}` }, tx)];
  }

  function renderItem(idx) {
    const item = items[idx];
    let node;
    if (typeof item === 'object') {
      const [s, e] = item.fold;
      node = h('div', { class: 'vr fold' }, `⋯ 展开 ${e - s} 行相同内容 ⋯`);
      node.addEventListener('click', () => {
        items.splice(idx, 1, ...Array.from({ length: e - s }, (_, k) => s + k));
        reset();
      });
    } else {
      const [type, ln, lt, rn, rt] = rows[item];
      const lc = !ln ? 'empty' : type === 'del' || type === 'chg' ? type : '';
      const rc = !rn ? 'empty' : type === 'add' || type === 'chg' ? type : '';
      node = h('div', { class: 'vr' }, cell(ln, lt, lc), cell(rn, rt, rc));
    }
    node.style.top = `${idx * ROW_H}px`;
    return node;
  }

  function refresh() {
    if (box.hidden) return;
    const first = Math.max(0, Math.floor(box.scrollTop / ROW_H) - OVERSCAN);
    const last = Math.min(items.length, Math.ceil((box.scrollTop + box.clientHeight) / ROW_H) + OVERSCAN);
    for (const [idx, node] of rendered) {
      if (idx < first || idx >= last) {
        node.remove();
        rendered.delete(idx);
      }
    }
    const frag = document.createDocumentFragment();
    for (let i = first; i < last; i++) {
      if (!rendered.has(i)) {
        const node = renderItem(i);
        rendered.set(i, node);
        frag.append(node);
      }
    }
    spacer.append(frag);
  }

  function reset() {
    rendered.forEach((n) => n.remove());
    rendered = new Map();
    spacer.style.height = `${items.length * ROW_H}px`;
    box.style.height = `${Math.min(items.length * ROW_H + 2, Math.round(innerHeight * 0.7))}px`;
    refresh();
  }

  box.addEventListener('scroll', () => requestAnimationFrame(refresh), { passive: true });

  return {
    setRows(newRows, onlyDiff) {
      rows = newRows;
      items = buildItems(onlyDiff);
      box.scrollTop = 0;
      reset();
    },
    refresh,
  };
}

function renderList(box, diffs) {
  if (!diffs.length) {
    box.replaceChildren(h('div', { class: 'ok' }, '✓ 没有差异'));
    return;
  }
  const fmt = (v) => {
    if (v === undefined) return '';
    const s = JSON.stringify(v);
    return s.length > 300 ? `${s.slice(0, 300)}…` : s;
  };
  const label = { added: ['add', '新增'], removed: ['del', '删除'], changed: ['chg', '修改'] };
  box.replaceChildren(
    h(
      'table',
      {},
      h('thead', {}, h('tr', {}, h('th', {}, '类型'), h('th', {}, '路径'), h('th', {}, '左侧'), h('th', {}, '右侧'))),
      h(
        'tbody',
        {},
        diffs.slice(0, LIST_LIMIT).map((d) =>
          h(
            'tr',
            {},
            h('td', {}, h('span', { class: `badge ${label[d.type][0]}` }, label[d.type][1])),
            h('td', {}, d.path),
            h('td', {}, fmt(d.left)),
            h('td', {}, fmt(d.right))
          )
        )
      )
    ),
    diffs.length > LIST_LIMIT
      ? h('div', { class: 'ok muted' }, `共 ${diffs.length.toLocaleString()} 处差异，仅显示前 ${LIST_LIMIT} 条`)
      : null
  );
}
