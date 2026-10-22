// 惰性渲染的 JSON 树：节点展开时才创建子元素，大数组/大对象分批显示，
// 因此渲染开销只与“可见节点数”有关，与 JSON 总大小无关。
import { keyPath } from '../lib/json.js';
import { h, copy } from './ui.js';

const CHUNK = 200; // 每批显示的子项数
const AUTO_OPEN = 600; // 初次渲染自动展开的子项预算
export const EXPAND_LIMIT = 20000; // “全部展开”最多渲染的节点数

export function createTree(container, onPath, { indent = () => 2 } = {}) {
  const meta = new WeakMap(); // box 节点 -> { v, path, entries, shown }

  function renderNode(key, v, path, isLast) {
    const comma = isLast ? null : h('span', { class: 'p' }, ',');
    const keyEl =
      key === undefined
        ? null
        : [h('span', { class: 'k', 'data-path': path }, typeof key === 'number' ? String(key) : JSON.stringify(key)), h('span', { class: 'p' }, ': ')];
    const cp = h('span', { class: 'cp', title: '复制此节点的 JSON' }, '复制');
    if (!v || typeof v !== 'object') return withMeta(h('div', { class: 'n' }, keyEl, primitive(v, path), comma, cp), v);

    const isArr = Array.isArray(v);
    const size = isArr ? v.length : Object.keys(v).length;
    const [open, close] = isArr ? ['[', ']'] : ['{', '}'];
    if (!size) return withMeta(h('div', { class: 'n' }, keyEl, h('span', { class: 'p' }, open + close), comma, cp), v);

    const node = h(
      'div',
      { class: 'n box closed' },
      h('span', { class: 'tg' }, '▶'),
      keyEl,
      h('span', { class: 'p' }, open),
      h('span', { class: 'cnt' }, `${isArr ? `${size} 项` : `${size} 个键`} …${close}`),
      cp,
      h('div', { class: 'ch' }),
      h('span', { class: 'p ch' }, close),
      comma
    );
    meta.set(node, { v, path, entries: null, shown: 0 });
    return node;
  }

  function withMeta(node, v) {
    meta.set(node, { v });
    return node;
  }

  function primitive(v, path) {
    let cls, text;
    if (v === null) [cls, text] = ['nl', 'null'];
    else if (typeof v === 'string') [cls, text] = ['s', JSON.stringify(v)];
    else if (typeof v === 'number') [cls, text] = ['num', String(v)];
    else [cls, text] = ['b', String(v)];
    const span = h('span', { class: `v ${cls}`, 'data-path': path, title: '单击显示路径，双击复制值' }, text);
    if (cls === 's' && /^https?:\/\/\S+$/.test(v)) {
      span.replaceChildren('"', h('a', { href: v, target: '_blank', rel: 'noreferrer' }, v), '"');
    }
    return span;
  }

  // 追加最多 count 个子项，返回实际渲染数
  function renderMore(node, count) {
    const m = meta.get(node);
    if (!m.entries) m.entries = Array.isArray(m.v) ? m.v.map((c, i) => [i, c]) : Object.entries(m.v);
    const ch = node.querySelector(':scope > div.ch');
    ch.querySelector(':scope > .more')?.remove();
    const end = Math.min(m.entries.length, m.shown + count);
    const frag = document.createDocumentFragment();
    for (let i = m.shown; i < end; i++) {
      const [k, c] = m.entries[i];
      frag.append(renderNode(k, c, keyPath(m.path, k), i === m.entries.length - 1));
    }
    ch.append(frag);
    const added = end - m.shown;
    m.shown = end;
    const rest = m.entries.length - end;
    if (rest > 0) {
      ch.append(
        h(
          'div',
          { class: 'more' },
          h('button', { class: 'sm ghost', 'data-more': String(CHUNK) }, `再显示 ${Math.min(CHUNK, rest)} 项`),
          h('button', { class: 'sm ghost', 'data-more': 'all' }, `显示剩余 ${rest} 项`)
        )
      );
    }
    return added;
  }

  function openNode(node, count = CHUNK) {
    const m = meta.get(node);
    let added = 0;
    if (m.shown === 0) added = renderMore(node, count);
    node.classList.remove('closed');
    node.querySelector(':scope > .tg').textContent = '▼';
    return added;
  }

  function closeNode(node) {
    node.classList.add('closed');
    node.querySelector(':scope > .tg').textContent = '▶';
  }

  const childBoxes = (node) => node.querySelectorAll(':scope > div.ch > .n.box');

  // 广度优先展开，直到用完预算；返回是否已全部展开
  function expandBfs(budget, count) {
    const root = container.querySelector('.n.box');
    if (!root) return true;
    const queue = [root];
    while (queue.length) {
      if (budget <= 0) return false;
      const node = queue.shift();
      budget -= openNode(node, Math.min(count, budget));
      const m = meta.get(node);
      if (count === Infinity && m.shown < m.entries.length) {
        if (budget <= 0) return false;
        budget -= renderMore(node, budget);
      }
      queue.push(...childBoxes(node));
    }
    return true;
  }

  container.addEventListener('click', (e) => {
    const t = e.target;
    if (t.classList.contains('tg')) {
      const node = t.parentElement;
      node.classList.contains('closed') ? openNode(node) : closeNode(node);
    } else if (t.classList.contains('cp')) {
      copy(JSON.stringify(meta.get(t.parentElement).v, null, indent()), '已复制节点 JSON');
    } else if (t.dataset.more) {
      const node = t.closest('.n.box');
      renderMore(node, t.dataset.more === 'all' ? Infinity : CHUNK);
    } else if (t.dataset.path) {
      onPath(t.dataset.path);
    }
  });
  // 悬停行高亮并显示“复制”按钮（只作用于最近的节点，不影响祖先节点）
  let hot = null;
  container.addEventListener('mouseover', (e) => {
    const n = e.target.closest('.n');
    if (n === hot) return;
    hot?.classList.remove('hot');
    (hot = n)?.classList.add('hot');
  });
  container.addEventListener('mouseleave', () => {
    hot?.classList.remove('hot');
    hot = null;
  });
  container.addEventListener('dblclick', (e) => {
    const t = e.target.closest('.v');
    if (!t) return;
    const raw = t.textContent;
    copy(t.classList.contains('s') ? JSON.parse(raw) : raw, '已复制值');
  });

  return {
    render(value) {
      container.replaceChildren(h('div', { class: 'tree-root' }, renderNode(undefined, value, '$', true)));
      expandBfs(AUTO_OPEN, CHUNK);
    },
    expandAll: () => expandBfs(EXPAND_LIMIT, Infinity),
    collapseAll() {
      container.querySelectorAll('.n.box:not(.closed)').forEach((n, i) => i > 0 && closeNode(n));
    },
    clear: () => container.replaceChildren(),
  };
}
