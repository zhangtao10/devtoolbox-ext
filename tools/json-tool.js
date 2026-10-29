import { parseJSON, sortKeys, repairJSON } from '../lib/json.js';
import { isCurl, parseCurl, toFetch } from '../lib/curl.js';
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
    if (isCurl(text)) return showCurl(text);
    stat.textContent = '解析中…';
    let r;
    try {
      r = await runInWorker('parse', { text, loose: looseChk.checked, indent: indent() });
    } catch (e) {
      if (!e.superseded) stat.textContent = `解析失败：${e.message}`;
      return;
    }
    if (input.value !== text) return; // 解析期间输入已变化（如换成了 curl 命令）
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

  // 输入为 curl 命令：显示请求摘要，由用户点击发送（请求可能有副作用，不自动发送）
  function showCurl(text) {
    hasValue = false;
    tree.clear();
    output.value = prettyText = '';
    stat.textContent = '';
    const r = parseCurl(text);
    if (!r.ok) return showError(errBox, `✗ curl 命令解析失败：${r.message}`);
    showError(
      errBox,
      h(
        'div',
        { class: 'curl-req' },
        h('div', { class: 'muted' }, `检测到 curl 命令 · ${r.headers.length} 个请求头${r.body !== undefined || r.form ? ' · 带请求体' : ''}`),
        h('div', { class: 'mono' }, h('b', {}, r.method), ' ', r.url),
        h('button', { class: 'sm primary', onclick: send, title: 'Ctrl/⌘ + Enter' }, '▶ 发送请求')
      )
    );
  }

  // 扩展页需获得目标域名的权限才能跨域请求；首次访问某域名时由浏览器弹窗确认
  function allowHost(url) {
    if (!globalThis.chrome?.permissions) return Promise.resolve(true);
    const { protocol, hostname } = new URL(url);
    return chrome.permissions.request({ origins: [`${protocol}//${hostname}/*`] });
  }

  // fetch 无法设置的请求头（Cookie、User-Agent、Referer 等）通过临时的 declarativeNetRequest 会话规则在网络层改写。
  // 规则只匹配本标签页发往目标域名、相同方法的请求，请求结束后立即删除。返回是否已改写
  async function withHeaderRule(url, method, headers, fn) {
    const dnr = globalThis.chrome?.declarativeNetRequest;
    if (!headers.length || !dnr) return fn(false);
    const tab = await chrome.tabs.getCurrent();
    const id = 1 + Math.floor(Math.random() * 0x7ffffffe);
    await dnr.updateSessionRules({
      addRules: [
        {
          id,
          priority: 1,
          action: {
            type: 'modifyHeaders',
            requestHeaders: headers.map(([header, value]) => ({ header, operation: 'set', value })),
          },
          condition: {
            requestDomains: [new URL(url).hostname],
            requestMethods: [method.toLowerCase()],
            resourceTypes: ['xmlhttprequest'],
            ...(tab ? { tabIds: [tab.id] } : {}),
          },
        },
      ],
    });
    try {
      return await fn(true);
    } finally {
      await dnr.updateSessionRules({ removeRuleIds: [id] }).catch(() => {});
    }
  }

  let sending = null;
  async function send() {
    const text = input.value;
    const req = parseCurl(text);
    if (!req.ok) return toast(`curl 命令解析失败：${req.message}`);
    if (!/^https?:/i.test(req.url)) return toast('只支持 http / https 请求');
    const { url, init, restricted, dropped } = toFetch(req);
    let granted;
    try {
      granted = await allowHost(url); // 必须在点击事件中同步发起，之前不能有 await
    } catch (e) {
      return toast(`无法申请访问权限：${e.message}`, 4000);
    }
    if (!granted) return toast('未授予访问该域名的权限，无法发送请求', 3000);
    sending?.abort();
    const ctrl = (sending = new AbortController());
    const timer = setTimeout(() => ctrl.abort(), 30000);
    stat.textContent = `请求中… ${req.method} ${url}`;
    const t0 = performance.now();
    try {
      let rewritten = false;
      const res = await withHeaderRule(url, req.method, restricted, (ok) => {
        rewritten = ok;
        return fetch(url, { ...init, signal: ctrl.signal });
      });
      const body = await res.text();
      if (input.value !== text || ctrl !== sending) return; // 请求期间输入已改动或发起了新请求
      const ms = Math.round(performance.now() - t0);
      const parsed = parseJSON(body);
      replaceText(input, parsed.ok ? pretty(parsed.value) : body);
      historyId = null;
      run();
      const ignored = [...dropped, ...(rewritten ? [] : restricted.map(([k]) => k))];
      const skip = ignored.length ? ` · 已忽略请求头 ${ignored.join(', ')}` : '';
      toast(`HTTP ${res.status} ${res.statusText} · ${ms} ms${skip} · Ctrl/⌘+Z 可回到 curl`, 5000);
    } catch (e) {
      if (ctrl !== sending) return;
      stat.textContent = '';
      toast(ctrl.signal.aborted ? '请求超时（30 秒）' : `请求失败：${e.message}`, 4000);
    } finally {
      clearTimeout(timer);
      if (ctrl === sending) sending = null;
    }
  }

  function repair() {
    const r = repairJSON(input.value);
    if (!r.ok) return toast('没有可修复的内容');
    if (!r.fixes.length) return toast('JSON 已合法，无需修复');
    replaceText(input, pretty(r.value));
    run();
    toast(`已修复（可 Ctrl/⌘+Z 撤销）：${r.fixes.join('、')}`, 4000);
  }
  input.addEventListener('input', runLater);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && isCurl(input.value)) {
      e.preventDefault();
      send();
    }
  });
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
