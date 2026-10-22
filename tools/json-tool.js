import { parseJSON, sortKeys, repairJSON } from '../lib/json.js';
import { el, on, h, copy, debounce, store, showError, parseErrorView, jumpTo, toast, createWorkerRunner, createHistory, historyMenu, replaceText } from './ui.js';
import { createTree, EXPAND_LIMIT } from './json-tree.js';

const SAMPLE = {
  name: 'DevToolbox',
  version: '1.0.0',
  features: ['JSON 解析', 'JSON 对比', '颜色转换', '时间戳', '编码解码', '正则测试'],
  author: { name: 'dev', homepage: 'https://example.com', verified: true },
  stats: { users: 1024, rating: 4.9, tags: null },
};

const formatSize = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`);

export function initJson(section) {
  const input = el(section, 'input');
  const output = el(section, 'output');
  const treeBox = el(section, 'tree');
  const errBox = el(section, 'error');
  const stat = el(section, 'stat');
  const pathBar = el(section, 'path');
  const indentSel = section.querySelector('[data-opt="indent"]');
  const looseChk = section.querySelector('[data-opt="loose"]');
  const tree = createTree(treeBox, (path) => (pathBar.textContent = path), { indent: () => indent() });
  const runInWorker = createWorkerRunner();
  let view = store.get('json.view', 'tree');
  let current; // 最近一次成功解析的值
  let prettyText = ''; // 格式化文本，切到“文本”视图时才写入 textarea（大文本写入很慢）
  let hasValue = false;
  const history = createHistory('json.history');
  let historyId = null; // 当前这轮编辑对应的历史记录，连续编辑只更新同一条

  indentSel.value = store.get('json.indent', '2');
  looseChk.checked = store.get('json.loose', false);
  store.remove('json.input'); // 旧版本保存的上次输入，打开时不再恢复

  const indent = () => (indentSel.value === 'tab' ? '\t' : Number(indentSel.value));
  const pretty = (v) => JSON.stringify(v, null, indent());

  function setView(v) {
    view = v;
    store.set('json.view', v);
    section.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
    treeBox.hidden = v !== 'tree';
    output.hidden = v !== 'text';
    if (v === 'text' && output.value !== prettyText) output.value = prettyText;
  }

  async function run() {
    const text = input.value;
    if (!text.trim()) {
      hasValue = false;
      tree.clear();
      output.value = prettyText = '';
      stat.textContent = '';
      showError(errBox, null);
      return;
    }
    stat.textContent = '解析中…';
    let r;
    try {
      r = await runInWorker('parse', { text, loose: looseChk.checked, indent: indent() });
    } catch (e) {
      if (!e.superseded) stat.textContent = `解析失败：${e.message}`;
      return;
    }
    if (!r.ok) {
      hasValue = false;
      stat.textContent = '';
      showError(errBox, [
        ...parseErrorView(text, r, () => jumpTo(input, r.pos)),
        h('button', { class: 'sm fix-btn', onclick: repair }, '🔧 一键修复'),
      ]);
      return;
    }
    showError(errBox, null);
    current = r.value;
    hasValue = true;
    prettyText = r.pretty;
    output.value = view === 'text' ? prettyText : '';
    tree.render(current);
    const tooBig = text.length > history.maxSize;
    if (!tooBig) recordLater(text);
    stat.textContent =
      `✓ 合法 JSON · ${r.nodes.toLocaleString()} 个节点 · ${formatSize(r.bytes)}` + (tooBig ? ' · 内容较大，不记入历史' : '');
    stat.title = stat.textContent;
  }

  const runLater = debounce(run, 250);
  const recordLater = debounce((text) => {
    if (input.value === text) historyId = history.put(historyId, { text }) ?? historyId;
  }, 1000);
  const load = (text) => {
    historyId = null;
    input.value = text;
    run();
  };

  function repair() {
    const r = repairJSON(input.value);
    if (!r.ok) return toast('没有可修复的内容');
    if (!r.fixes.length) return toast('JSON 已合法，无需修复');
    replaceText(input, pretty(r.value));
    run();
    toast(`已修复（可 Ctrl/⌘+Z 撤销）：${r.fixes.join('、')}`, 4000);
  }
  input.addEventListener('input', runLater);
  indentSel.addEventListener('change', () => {
    store.set('json.indent', indentSel.value);
    run();
  });
  looseChk.addEventListener('change', () => {
    store.set('json.loose', looseChk.checked);
    run();
  });
  section.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

  // 操作按钮在主线程同步解析当前输入，保证拿到的是最新内容
  const withValue = (fn) => () => {
    const r = parseJSON(input.value, { loose: looseChk.checked });
    if (!r.ok) return input.value.trim() && toast('请先修正 JSON 错误');
    current = r.value;
    fn();
    run();
  };
  on(section, 'format', withValue(() => (input.value = pretty(current))));
  on(section, 'minify', withValue(() => (input.value = JSON.stringify(current))));
  on(section, 'sort', withValue(() => (input.value = pretty(sortKeys(current)))));
  on(section, 'escape', () => {
    input.value = JSON.stringify(input.value);
    run();
  });
  on(section, 'unescape', () => {
    let s = input.value.trim();
    if (!s.startsWith('"')) s = `"${s}"`;
    try {
      const str = JSON.parse(s);
      const inner = parseJSON(str);
      input.value = inner.ok ? pretty(inner.value) : str;
      run();
    } catch {
      toast('不是合法的转义字符串');
    }
  });
  on(section, 'repair', repair);
  on(section, 'sample', () => load(pretty(SAMPLE)));
  on(section, 'clear', () => {
    load('');
    input.focus();
  });
  historyMenu(el(section, 'history'), history, {
    preview: (d) => d.text,
    onPick: (d) => load(d.text),
    empty: '暂无历史，解析成功后自动记录',
  });
  on(section, 'copy', () => hasValue && copy(prettyText));
  on(section, 'expand', () => {
    if (!hasValue) return;
    if (!tree.expandAll()) toast(`数据较大，已展开前 ${EXPAND_LIMIT.toLocaleString()} 个节点，其余可逐级展开`);
  });
  on(section, 'collapse', () => tree.collapseAll());
  pathBar.addEventListener('click', () => pathBar.textContent && copy(pathBar.textContent, '已复制路径'));

  setView(view);
  run();
}
