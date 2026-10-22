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
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 1600);
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
    } catch {
      /* 存储满或被禁用时忽略 */
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

export const MAX_PERSIST = 512 * 1024; // 超过 512KB 的输入不写入 localStorage

export function persistText(key, text) {
  if (text.length > MAX_PERSIST) {
    store.set(key, '');
    return false;
  }
  store.set(key, text);
  return true;
}
