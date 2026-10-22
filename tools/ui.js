// 各工具共享的小工具函数。

export const el = (section, name) => section.querySelector(`[data-el="${name}"]`);

export function on(section, act, handler) {
  section.querySelectorAll(`[data-act="${act}"]`).forEach((b) => b.addEventListener('click', handler));
}

export function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== false) node.setAttribute(k, v);
  }
  node.append(...children.flat().filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}

let toastTimer;
export function toast(msg, ms = 1600) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms);
}

export async function copy(text, label = '已复制') {
  try {
    await navigator.clipboard.writeText(text);
    toast(label);
  } catch {
    toast('复制失败');
  }
}

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(`dtb:${key}`);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`dtb:${key}`, JSON.stringify(value));
      return true;
    } catch {
      return false; // 存储满或被禁用
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(`dtb:${key}`);
    } catch {
      /* 忽略 */
    }
  },
};

export function showError(box, content) {
  if (!content) {
    box.hidden = true;
    box.replaceChildren();
    return;
  }
  box.hidden = false;
  box.replaceChildren(...[content].flat());
}

// 解析错误：附带出错行与指示符
export function parseErrorView(text, r, onJump) {
  const lineText = text.split('\n')[r.line - 1] ?? '';
  const start = Math.max(0, r.column - 40);
  const snippet = lineText.slice(start, r.column + 40);
  return [
    `✗ ${r.message} `,
    h('span', { class: 'jump', onclick: onJump }, `（第 ${r.line} 行，第 ${r.column} 列）`),
    h('pre', {}, `${snippet}\n${' '.repeat(r.column - 1 - start)}^`),
  ];
}

export function jumpTo(textarea, pos) {
  textarea.focus();
  textarea.setSelectionRange(pos, pos + 1);
  const line = textarea.value.slice(0, pos).split('\n').length;
  const lh = parseFloat(getComputedStyle(textarea).lineHeight) || 20;
  textarea.scrollTop = Math.max(0, (line - 5) * lh);
}

// 每个调用方独占一个 Worker；新任务到来时直接终止仍在计算的旧任务，只保留最新结果。
export function createWorkerRunner() {
  let worker = null;
  let pending = null;
  let seq = 0;
  const spawn = () => {
    worker = new Worker(new URL('../worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (!pending || data.id !== pending.id) return;
      const { resolve, reject } = pending;
      pending = null;
      data.error ? reject(new Error(data.error)) : resolve(data.result);
    };
  };
  return (type, payload) => {
    if (pending) {
      worker.terminate();
      pending.reject(Object.assign(new Error('superseded'), { superseded: true }));
      pending = null;
      worker = null;
    }
    if (!worker) spawn();
    const id = ++seq;
    return new Promise((resolve, reject) => {
      pending = { id, resolve, reject };
      worker.postMessage({ id, type, payload });
    });
  };
}

// 最近 limit 条历史记录（localStorage）。单条超过 maxSize 字符不记录；存储满时依次丢弃最旧的记录。
export function createHistory(key, { limit = 10, maxSize = 256 * 1024 } = {}) {
  const list = () => store.get(key, []);
  const save = (items) => {
    while (!store.set(key, items) && items.length > 1) items = items.slice(0, -1);
  };
  return {
    maxSize,
    list,
    // id 为空时新建记录，否则更新该条；与其他记录内容相同时合并。返回记录 id，未记录时返回 null
    put(id, data) {
      if (Object.values(data).reduce((n, v) => n + v.length, 0) > maxSize) return null;
      const sig = JSON.stringify(data);
      const items = list().filter((e) => e.id !== id && JSON.stringify(e.data) !== sig);
      const entry = { id: id || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, t: Date.now(), data };
      save([entry, ...items].slice(0, limit));
      return entry.id;
    },
    remove: (id) => save(list().filter((e) => e.id !== id)),
    clear: () => store.set(key, []),
  };
}

// 历史记录下拉面板。preview(data) 返回单行预览文本，onPick(data) 在选中时调用。
export function historyMenu(button, history, { preview, onPick, empty = '暂无历史' }) {
  let pop = null;
  const close = () => {
    pop?.remove();
    pop = null;
    document.removeEventListener('mousedown', outside, true);
    document.removeEventListener('keydown', esc, true);
  };
  const outside = (e) => !pop?.contains(e.target) && e.target !== button && close();
  const esc = (e) => e.key === 'Escape' && close();
  const time = (t) => {
    const d = new Date(t);
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  function render() {
    const items = history.list();
    pop.replaceChildren(
      h(
        'div',
        { class: 'hist-h' },
        `最近 ${items.length} 条记录`,
        h('span', { class: 'grow' }),
        items.length ? h('button', { class: 'ghost sm', onclick: () => (history.clear(), render()) }, '清空') : null
      ),
      ...(items.length
        ? items.map((e) =>
            h(
              'div',
              { class: 'hist-item', title: '点击载入', onclick: () => (close(), onPick(e.data)) },
              h('span', { class: 'muted' }, time(e.t)),
              h('span', { class: 'hist-pv mono' }, preview(e.data).slice(0, 400).replace(/\s+/g, ' ')),
              h(
                'button',
                {
                  class: 'ghost sm',
                  title: '删除',
                  onclick: (ev) => {
                    ev.stopPropagation();
                    history.remove(e.id);
                    render();
                  },
                },
                '×'
              )
            )
          )
        : [h('div', { class: 'hist-empty muted' }, empty)])
    );
  }

  button.addEventListener('click', () => {
    if (pop) return close();
    pop = h('div', { class: 'hist-pop' });
    document.body.append(pop);
    render();
    const r = button.getBoundingClientRect();
    pop.style.top = `${r.bottom + 6}px`;
    pop.style.left = `${Math.max(8, Math.min(r.left, innerWidth - pop.offsetWidth - 8))}px`;
    document.addEventListener('mousedown', outside, true);
    document.addEventListener('keydown', esc, true);
  });
}

// 整体替换 textarea 内容，并保留撤销记录（Ctrl/Cmd+Z 可恢复）
export function replaceText(textarea, text) {
  textarea.focus();
  textarea.select();
  if (text.length > 1 << 20 || !document.execCommand('insertText', false, text)) textarea.value = text;
  textarea.setSelectionRange(0, 0);
  textarea.scrollTop = 0;
}
