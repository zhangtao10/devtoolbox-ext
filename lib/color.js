// 颜色解析与多格式互转。内部统一用 {r,g,b: 0-255, a: 0-1}。

const NAMED_SRC =
  'aliceblue:f0f8ff,antiquewhite:faebd7,aqua:00ffff,aquamarine:7fffd4,azure:f0ffff,beige:f5f5dc,bisque:ffe4c4,' +
  'black:000000,blanchedalmond:ffebcd,blue:0000ff,blueviolet:8a2be2,brown:a52a2a,burlywood:deb887,cadetblue:5f9ea0,' +
  'chartreuse:7fff00,chocolate:d2691e,coral:ff7f50,cornflowerblue:6495ed,cornsilk:fff8dc,crimson:dc143c,cyan:00ffff,' +
  'darkblue:00008b,darkcyan:008b8b,darkgoldenrod:b8860b,darkgray:a9a9a9,darkgreen:006400,darkgrey:a9a9a9,' +
  'darkkhaki:bdb76b,darkmagenta:8b008b,darkolivegreen:556b2f,darkorange:ff8c00,darkorchid:9932cc,darkred:8b0000,' +
  'darksalmon:e9967a,darkseagreen:8fbc8f,darkslateblue:483d8b,darkslategray:2f4f4f,darkslategrey:2f4f4f,' +
  'darkturquoise:00ced1,darkviolet:9400d3,deeppink:ff1493,deepskyblue:00bfff,dimgray:696969,dimgrey:696969,' +
  'dodgerblue:1e90ff,firebrick:b22222,floralwhite:fffaf0,forestgreen:228b22,fuchsia:ff00ff,gainsboro:dcdcdc,' +
  'ghostwhite:f8f8ff,gold:ffd700,goldenrod:daa520,gray:808080,green:008000,greenyellow:adff2f,grey:808080,' +
  'honeydew:f0fff0,hotpink:ff69b4,indianred:cd5c5c,indigo:4b0082,ivory:fffff0,khaki:f0e68c,lavender:e6e6fa,' +
  'lavenderblush:fff0f5,lawngreen:7cfc00,lemonchiffon:fffacd,lightblue:add8e6,lightcoral:f08080,lightcyan:e0ffff,' +
  'lightgoldenrodyellow:fafad2,lightgray:d3d3d3,lightgreen:90ee90,lightgrey:d3d3d3,lightpink:ffb6c1,' +
  'lightsalmon:ffa07a,lightseagreen:20b2aa,lightskyblue:87cefa,lightslategray:778899,lightslategrey:778899,' +
  'lightsteelblue:b0c4de,lightyellow:ffffe0,lime:00ff00,limegreen:32cd32,linen:faf0e6,magenta:ff00ff,maroon:800000,' +
  'mediumaquamarine:66cdaa,mediumblue:0000cd,mediumorchid:ba55d3,mediumpurple:9370db,mediumseagreen:3cb371,' +
  'mediumslateblue:7b68ee,mediumspringgreen:00fa9a,mediumturquoise:48d1cc,mediumvioletred:c71585,' +
  'midnightblue:191970,mintcream:f5fffa,mistyrose:ffe4e1,moccasin:ffe4b5,navajowhite:ffdead,navy:000080,' +
  'oldlace:fdf5e6,olive:808000,olivedrab:6b8e23,orange:ffa500,orangered:ff4500,orchid:da70d6,palegoldenrod:eee8aa,' +
  'palegreen:98fb98,paleturquoise:afeeee,palevioletred:db7093,papayawhip:ffefd5,peachpuff:ffdab9,peru:cd853f,' +
  'pink:ffc0cb,plum:dda0dd,powderblue:b0e0e6,purple:800080,rebeccapurple:663399,red:ff0000,rosybrown:bc8f8f,' +
  'royalblue:4169e1,saddlebrown:8b4513,salmon:fa8072,sandybrown:f4a460,seagreen:2e8b57,seashell:fff5ee,' +
  'sienna:a0522d,silver:c0c0c0,skyblue:87ceeb,slateblue:6a5acd,slategray:708090,slategrey:708090,snow:fffafa,' +
  'springgreen:00ff7f,steelblue:4682b4,tan:d2b48c,teal:008080,thistle:d8bfd8,tomato:ff6347,turquoise:40e0d0,' +
  'violet:ee82ee,wheat:f5deb3,white:ffffff,whitesmoke:f5f5f5,yellow:ffff00,yellowgreen:9acd32';

export const NAMED = Object.fromEntries(NAMED_SRC.split(',').map((p) => p.split(':')));

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round = (v, d = 0) => {
  const f = 10 ** d;
  return Math.round(v * f) / f;
};

function parseHex(s) {
  const h = s.replace(/^#/, '');
  if (!/^([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(h)) return null;
  const full = h.length <= 4 ? [...h].map((c) => c + c).join('') : h;
  const n = (i) => parseInt(full.slice(i, i + 2), 16);
  return { r: n(0), g: n(2), b: n(4), a: full.length === 8 ? n(6) / 255 : 1 };
}

// 解析 "fn(a, b, c[, d])" 或 "fn(a b c[ / d])"，返回原始分量字符串数组
function parseFn(s) {
  const m = /^([a-z]+)\(\s*([^)]*)\)$/i.exec(s);
  if (!m) return null;
  const parts = m[2].includes(',') ? m[2].split(',') : m[2].replace('/', ' ').split(/\s+/);
  return { name: m[1].toLowerCase(), args: parts.map((p) => p.trim()).filter(Boolean) };
}

// 数值分量：percentScale 表示 100% 对应的值；返回 NaN 表示非法
function num(str, percentScale) {
  if (!/^-?\d*\.?\d+(%|deg)?$/.test(str)) return NaN;
  const v = parseFloat(str);
  return str.endsWith('%') ? (v / 100) * percentScale : v;
}

function alpha(str) {
  if (str === undefined) return 1;
  const a = num(str, 1);
  return a >= 0 && a <= 1 ? a : NaN;
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}

function hsvToRgb(h, s, v) {
  const l = v * (1 - s / 2);
  const sl = l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l);
  return hslToRgb(h, sl, l);
}

export function parseColor(input) {
  const s = String(input).trim().toLowerCase();
  if (!s) return null;
  if (NAMED[s]) return parseHex(NAMED[s]);
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const hex = parseHex(s);
  if (hex) return hex;

  const fn = parseFn(s);
  if (!fn) return null;
  const { name, args } = fn;
  if (args.length < 3 || args.length > (name === 'cmyk' ? 4 : 4)) return null;
  let out = null;

  if (name === 'rgb' || name === 'rgba') {
    const [r, g, b] = args.slice(0, 3).map((a) => num(a, 255));
    const a = alpha(args[3]);
    if ([r, g, b].every((v) => v >= 0 && v <= 255) && !isNaN(a)) out = { r: Math.round(r), g: Math.round(g), b: Math.round(b), a };
  } else if (['hsl', 'hsla', 'hsv', 'hsb', 'hwb'].includes(name)) {
    const h = num(args[0], 360);
    const p = num(args[1], 1);
    const q = num(args[2], 1);
    const a = alpha(args[3]);
    if (isNaN(h) || !(p >= 0 && p <= 1) || !(q >= 0 && q <= 1) || isNaN(a)) return null;
    let rgb;
    if (name.startsWith('hsl')) rgb = hslToRgb(h, p, q);
    else if (name === 'hwb') {
      const sum = p + q;
      const [w, bl] = sum > 1 ? [p / sum, q / sum] : [p, q];
      rgb = hsvToRgb(h, bl === 1 ? 0 : 1 - w / (1 - bl), 1 - bl);
    } else rgb = hsvToRgb(h, p, q);
    out = { ...rgb, a };
  } else if (name === 'cmyk') {
    if (args.length !== 4) return null;
    const [c, m, y, k] = args.map((a) => (a.endsWith('%') ? num(a, 1) : num(a, 1) > 1 ? num(a, 1) / 100 : num(a, 1)));
    if (![c, m, y, k].every((v) => v >= 0 && v <= 1)) return null;
    out = {
      r: Math.round(255 * (1 - c) * (1 - k)),
      g: Math.round(255 * (1 - m) * (1 - k)),
      b: Math.round(255 * (1 - y) * (1 - k)),
      a: 1,
    };
  }
  return out;
}

export function rgbToHsl({ r, g, b }) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h: hue(r, g, b, max, d), s, l };
}

export function rgbToHsv({ r, g, b }) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  return { h: hue(r, g, b, max, d), s: max === 0 ? 0 : d / max, v: max };
}

function hue(r, g, b, max, d) {
  if (d === 0) return 0;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

// sRGB -> OKLCH
export function rgbToOklch({ r, g, b }) {
  const lin = (c) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [lr, lg, lb] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.sqrt(A * A + B * B);
  let H = (Math.atan2(B, A) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { l: L, c: C, h: C < 1e-4 ? 0 : H };
}

export function luminance({ r, g, b }) {
  const lin = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(c1, c2) {
  const [a, b] = [luminance(c1), luminance(c2)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

const pct = (v) => `${Math.round(v * 100)}%`;

export function formatAll(color) {
  const { r, g, b } = color;
  const a = clamp(color.a ?? 1, 0, 1);
  const hasA = a < 1;
  const aStr = round(a, 2);
  const hx = (n) => n.toString(16).padStart(2, '0').toUpperCase();
  const hsl = rgbToHsl(color);
  const hsv = rgbToHsv(color);
  const k = 1 - Math.max(r, g, b) / 255;
  const cmy = (c) => (k === 1 ? 0 : (1 - c / 255 - k) / (1 - k));
  const ok = rgbToOklch(color);
  const name = Object.keys(NAMED).find((n) => NAMED[n] === (hx(r) + hx(g) + hx(b)).toLowerCase());

  return {
    hex: `#${hx(r)}${hx(g)}${hx(b)}${hasA ? hx(Math.round(a * 255)) : ''}`,
    rgb: hasA ? `rgba(${r}, ${g}, ${b}, ${aStr})` : `rgb(${r}, ${g}, ${b})`,
    hsl: hasA
      ? `hsla(${Math.round(hsl.h)}, ${pct(hsl.s)}, ${pct(hsl.l)}, ${aStr})`
      : `hsl(${Math.round(hsl.h)}, ${pct(hsl.s)}, ${pct(hsl.l)})`,
    hsv: `hsv(${Math.round(hsv.h)}, ${pct(hsv.s)}, ${pct(hsv.v)})`,
    hwb: `hwb(${Math.round(hsv.h)} ${pct((1 - hsv.s) * hsv.v)} ${pct(1 - hsv.v)}${hasA ? ` / ${aStr}` : ''})`,
    cmyk: `cmyk(${pct(cmy(r))}, ${pct(cmy(g))}, ${pct(cmy(b))}, ${pct(k)})`,
    oklch: `oklch(${round(ok.l * 100, 2)}% ${round(ok.c, 4)} ${round(ok.h, 2)}${hasA ? ` / ${aStr}` : ''})`,
    int: String((r << 16) | (g << 8) | b),
    androidArgb: `#${hx(Math.round(a * 255))}${hx(r)}${hx(g)}${hx(b)}`,
    uiColor: `UIColor(red: ${round(r / 255, 3)}, green: ${round(g / 255, 3)}, blue: ${round(b / 255, 3)}, alpha: ${aStr})`,
    ...(name ? { name } : {}),
  };
}
