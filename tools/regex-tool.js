import { runRegex, PRESETS } from '../lib/regex.js';
import { el, h, copy, debounce, store, showError } from './ui.js';

const FLAGS = [
  ['g', '全局'],
  ['i', '忽略大小写'],
  ['m', '多行'],
  ['s', '. 匹配换行'],
  ['u', 'Unicode'],
  ['y', '粘连'],
];

export function initRegex(section) {
  const pattern = el(section, 'pattern');
  const text = el(section, 'text');
  const hl = el(section, 'hl');
  const replace = el(section, 'replace');
  const errBox = el(section, 'error');
  const matchesBox = el(section, 'matches');
  const countEl = el(section, 'count');
  const replaced = el(section, 'replaced');
  const flagsBox = el(section, 'flags');
  const presets = el(section, 'presets');

  let flags = new Set(store.get('regex.flags', 'g'));
  flagsBox.replaceChildren(
    ...FLAGS.map(([f, title]) => {
      const lbl = h('label', { title, class: flags.has(f) ? 'on' : '' }, f);
      lbl.addEventListener('click', () => {
        flags.has(f) ? flags.delete(f) : flags.add(f);
        lbl.classList.toggle('on', flags.has(f));
        run();
      });
      return lbl;
    })
  );

  presets.append(...PRESETS.map((p, i) => h('option', { value: String(i) }, p.name)));
  presets.addEventListener('change', () => {
    const p = PRESETS[presets.value];
    if (!p) return;
    pattern.value = p.pattern;
    flags = new Set(p.flags ?? (text.value.includes('\n') ? 'gm' : 'g'));
    flagsBox.querySelectorAll('label').forEach((l) => l.classList.toggle('on', flags.has(l.textContent)));
    if (!text.value.trim()) text.value = p.example;
    presets.value = '';
    run();
  });

  pattern.value = store.get('regex.pattern', '(\\w+)@(\\w+)\\.com');
  text.value = store.get('regex.text', 'alice@example.com\nbob@test.com\ninvalid@mail');
  replace.value = store.get('regex.replace', '');

  function run() {
    const flagStr = FLAGS.map(([f]) => f).filter((f) => flags.has(f)).join('');
    store.set('regex.pattern', pattern.value);
    store.set('regex.text', text.value);
    store.set('regex.replace', replace.value);
    store.set('regex.flags', flagStr);

    if (!pattern.value) {
      showError(errBox, null);
      hl.replaceChildren(text.value);
      matchesBox.replaceChildren(h('div', { class: 'empty' }, '请输入正则表达式'));
      countEl.textContent = '';
      replaced.textContent = '';
      return;
    }
    const r = runRegex(pattern.value, flagStr, text.value, replace.value);
    if (!r.ok) {
      showError(errBox, `✗ ${r.message}`);
      return;
    }
    showError(errBox, null);
    countEl.textContent = `${r.matches.length} 个匹配`;

    // 高亮层：与 textarea 同样排版，mark 标出匹配区间
    const parts = [];
    let last = 0;
    for (const m of r.matches) {
      if (!m.text) continue;
      parts.push(text.value.slice(last, m.index), h('mark', {}, m.text));
      last = m.index + m.text.length;
    }
    parts.push(text.value.slice(last) + '\n');
    hl.replaceChildren(...parts);
    syncScroll();

    matchesBox.replaceChildren(
      ...(r.matches.length
        ? r.matches.map((m, i) =>
            h(
              'div',
              { class: 'm' },
              h('div', {}, h('b', {}, `#${i + 1}`), ` [${m.index}] `, h('span', { class: 'copyable', onclick: () => copy(m.text) }, JSON.stringify(m.text))),
              m.groups.map((g, gi) => h('div', { class: 'g' }, `$${gi + 1}: ${g === undefined ? 'undefined' : JSON.stringify(g)}`)),
              Object.entries(m.named ?? {}).map(([k, v]) => h('div', { class: 'g' }, `<${k}>: ${JSON.stringify(v)}`))
            )
          )
        : [h('div', { class: 'empty' }, '无匹配')])
    );
    replaced.textContent = replace.value ? r.replaced : '';
  }

  function syncScroll() {
    hl.scrollTop = text.scrollTop;
    hl.scrollLeft = text.scrollLeft;
  }

  const runLater = debounce(run, 120);
  [pattern, text, replace].forEach((n) => n.addEventListener('input', runLater));
  text.addEventListener('scroll', syncScroll);
  run();
}
