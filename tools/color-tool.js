import { parseColor, formatAll, rgbToHsl, contrast } from '../lib/color.js';
import { el, on, h, copy, store, showError, toast } from './ui.js';

const LABELS = {
  hex: 'HEX',
  rgb: 'RGB',
  hsl: 'HSL',
  hsv: 'HSV / HSB',
  hwb: 'HWB',
  cmyk: 'CMYK',
  oklch: 'OKLCH',
  int: '十进制整数',
  androidArgb: 'Android ARGB',
  uiColor: 'Swift UIColor',
  name: 'CSS 颜色名',
};

const hasStorage = typeof chrome !== 'undefined' && chrome.storage?.local;

export function initColor(section) {
  const input = el(section, 'input');
  const native = el(section, 'native');
  const alpha = el(section, 'alpha');
  const alphaV = el(section, 'alpha-v');
  const errBox = el(section, 'error');
  let color = parseColor(store.get('color.last', '#5B4EE6'));

  function render(source) {
    const f = formatAll(color);
    store.set('color.last', f.hex);
    if (source !== 'input') input.value = f.hex;
    if (source !== 'native') native.value = f.hex.slice(0, 7);
    if (source !== 'alpha') alpha.value = Math.round(color.a * 100);
    alphaV.textContent = `${Math.round(color.a * 100)}%`;
    el(section, 'swatch-in').style.background = f.rgb;

    el(section, 'formats').replaceChildren(
      ...Object.entries(LABELS)
        .filter(([k]) => f[k])
        .flatMap(([k, label]) => [
          h('span', { class: 'lbl' }, label),
          h('span', { class: 'val copyable', onclick: () => copy(f[k]) }, f[k]),
          h('button', { class: 'sm ghost', onclick: () => copy(f[k]) }, '复制'),
        ])
    );

    const level = (r) => (r >= 7 ? 'AAA' : r >= 4.5 ? 'AA' : r >= 3 ? 'AA 大字' : '不达标');
    el(section, 'contrast').replaceChildren(
      ...[
        ['#FFFFFF', '白底'],
        ['#000000', '黑底'],
      ].map(([bg, name]) => {
        const r = contrast(color, parseColor(bg));
        const box = h(
          'div',
          { class: 'cbox' },
          h('div', { class: 'ratio' }, `${r.toFixed(2)} : 1`),
          h('div', { class: 'lv' }, `${name}文字 · ${level(r)}`)
        );
        box.style.background = bg;
        box.style.color = f.rgb;
        return box;
      })
    );

    const { h: hue, s } = rgbToHsl(color);
    el(section, 'shades').replaceChildren(
      ...[95, 85, 75, 65, 55, 45, 35, 25, 15, 8].map((l) => {
        const c = parseColor(`hsl(${hue.toFixed(1)}, ${(s * 100).toFixed(1)}%, ${l}%)`);
        const hex = formatAll(c).hex;
        const d = h('div', { title: hex, onclick: () => set(c) });
        d.style.background = hex;
        return d;
      })
    );
  }

  function set(c, source) {
    color = c;
    showError(errBox, null);
    render(source);
  }

  input.addEventListener('input', () => {
    if (!input.value.trim()) return;
    const c = parseColor(input.value);
    if (c) set(c, 'input');
    else showError(errBox, '无法识别的颜色格式');
  });
  native.addEventListener('input', () => set({ ...parseColor(native.value), a: color.a }, 'native'));
  alpha.addEventListener('input', () => set({ ...color, a: alpha.value / 100 }, 'alpha'));
  on(section, 'random', () =>
    set({ r: (Math.random() * 256) | 0, g: (Math.random() * 256) | 0, b: (Math.random() * 256) | 0, a: 1 })
  );

  const pickBtn = section.querySelector('[data-act="pick"]');
  if (!('EyeDropper' in window)) {
    pickBtn.disabled = true;
    pickBtn.title = '当前浏览器不支持 EyeDropper API';
  }
  on(section, 'pick', async () => {
    try {
      const { sRGBHex } = await new EyeDropper().open();
      set(parseColor(sRGBHex));
      addHistory(formatAll(color).hex);
      copy(formatAll(color).hex, `已取色并复制 ${formatAll(color).hex}`);
    } catch (e) {
      if (e?.name !== 'AbortError') toast(`取色失败：${e.message}`);
    }
  });

  // 取色历史（与页面取色共享 chrome.storage）
  const historyBox = el(section, 'history');
  function renderHistory(list) {
    historyBox.replaceChildren(
      ...(list.length
        ? list.map((hex) => {
            const b = h('button', { title: hex, onclick: () => set(parseColor(hex)) });
            b.style.background = hex;
            return b;
          })
        : [h('span', { class: 'muted' }, '暂无，使用「屏幕取色」或插件弹窗中的「页面取色」')])
    );
  }
  async function addHistory(hex) {
    if (!hasStorage) return;
    const { pickHistory = [] } = await chrome.storage.local.get('pickHistory');
    await chrome.storage.local.set({ pickHistory: [hex, ...pickHistory.filter((c) => c !== hex)].slice(0, 30) });
  }
  if (hasStorage) {
    chrome.storage.local.get({ pickHistory: [] }).then(({ pickHistory }) => renderHistory(pickHistory));
    chrome.storage.onChanged.addListener((ch) => ch.pickHistory && renderHistory(ch.pickHistory.newValue ?? []));
  } else renderHistory([]);
  on(section, 'clear-history', () => hasStorage && chrome.storage.local.set({ pickHistory: [] }));

  const params = new URLSearchParams(location.search);
  const fromUrl = params.get('c') && parseColor(params.get('c'));
  if (fromUrl) color = fromUrl;
  render();
  if (params.get('pick')) {
    pickBtn.focus();
    toast('点击「屏幕取色」后，可吸取屏幕上任意位置的颜色');
  }
}
