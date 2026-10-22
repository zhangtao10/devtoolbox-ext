import { parseTime, formatDate, describeTime, LOCAL_TZ } from '../lib/time.js';
import { el, on, h, copy, store, showError } from './ui.js';

export function initTime(section) {
  const tzSel = el(section, 'tz');
  const input = el(section, 'input');
  const errBox = el(section, 'error');
  const result = el(section, 'result');

  const zones = Intl.supportedValuesOf?.('timeZone') ?? [LOCAL_TZ];
  const common = [...new Set([LOCAL_TZ, 'UTC', 'Asia/Shanghai', 'Asia/Tokyo', 'Europe/London', 'America/New_York', 'America/Los_Angeles'])];
  tzSel.replaceChildren(
    h('optgroup', { label: '常用' }, common.map((z) => h('option', { value: z }, z === LOCAL_TZ ? `${z}（本地）` : z))),
    h('optgroup', { label: '全部' }, zones.filter((z) => !common.includes(z)).map((z) => h('option', { value: z }, z)))
  );
  tzSel.value = store.get('time.tz', LOCAL_TZ);
  input.value = store.get('time.input', String(Math.floor(Date.now() / 1000)));

  // 实时时钟
  const nowS = el(section, 'now-s');
  const nowMs = el(section, 'now-ms');
  const nowDate = el(section, 'now-date');
  let paused = false;
  const tick = () => {
    if (paused) return;
    const now = new Date();
    nowS.textContent = Math.floor(now.getTime() / 1000);
    nowMs.textContent = now.getTime();
    nowDate.textContent = formatDate(now, tzSel.value).slice(0, 19);
  };
  setInterval(tick, 100);
  tick();
  [nowS, nowMs, nowDate].forEach((n) => n.addEventListener('click', () => copy(n.textContent)));
  on(section, 'pause', (e) => {
    paused = !paused;
    e.currentTarget.textContent = paused ? '继续' : '暂停';
  });

  function convert() {
    store.set('time.input', input.value);
    const v = input.value.trim();
    if (!v) {
      result.replaceChildren();
      showError(errBox, null);
      return;
    }
    const d = parseTime(v, { tz: tzSel.value });
    if (!d || isNaN(d)) {
      result.replaceChildren();
      showError(errBox, '无法识别：请输入时间戳或 YYYY-MM-DD HH:mm:ss 格式的日期');
      return;
    }
    showError(errBox, null);
    const info = describeTime(d, tzSel.value);
    result.replaceChildren(
      ...Object.entries(info).map(([k, val]) =>
        h('tr', {}, h('td', {}, k), h('td', { title: '点击复制', onclick: () => copy(val) }, val))
      )
    );
  }

  input.addEventListener('input', convert);
  tzSel.addEventListener('change', () => {
    store.set('time.tz', tzSel.value);
    convert();
    tick();
  });
  on(section, 'now', () => {
    input.value = String(Date.now());
    convert();
  });
  on(section, 'today', () => {
    input.value = formatDate(new Date(), tzSel.value).slice(0, 10) + ' 00:00:00';
    convert();
  });
  convert();
}
