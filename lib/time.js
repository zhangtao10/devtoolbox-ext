// 时间戳 <-> 日期互转，支持 s / ms / μs / ns 自动识别与时区。

export const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

function partsIn(date, tz) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}

// 某时区在给定时刻相对 UTC 的偏移（毫秒）
export function tzOffset(date, tz) {
  const p = partsIn(date, tz);
  const wall = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
  return wall - Math.floor(date.getTime() / 1000) * 1000;
}

function fromNumber(str) {
  const neg = str.startsWith('-');
  const [int, frac] = str.replace(/^[-+]/, '').split('.');
  let ms;
  if (frac !== undefined || int.length <= 11) ms = Number(`${int}.${frac ?? 0}`) * 1000;
  else if (int.length <= 14) ms = Number(int);
  else if (int.length <= 17) ms = Number(int.slice(0, -3));
  else ms = Number(int.slice(0, -6));
  return new Date(Math.round(neg ? -ms : ms));
}

const NAIVE = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:\.(\d{1,3}))?)?)?$/;

export function parseTime(input, { tz = LOCAL_TZ } = {}) {
  const s = String(input).trim();
  if (!s) return null;
  if (/^[-+]?\d+(\.\d+)?$/.test(s)) return fromNumber(s);

  const m = NAIVE.exec(s);
  if (m) {
    const [y, mo, d, h = 0, mi = 0, sec = 0] = m.slice(1, 7).map((v) => +(v ?? 0));
    const ms = m[7] ? +m[7].padEnd(3, '0') : 0;
    const wall = Date.UTC(y, mo - 1, d, h, mi, sec, ms);
    // 两次迭代以处理夏令时边界
    let t = wall - tzOffset(new Date(wall), tz);
    t = wall - tzOffset(new Date(t), tz);
    return new Date(t);
  }
  const t = Date.parse(s);
  return isNaN(t) ? null : new Date(t);
}

const pad = (n, w = 2) => String(n).padStart(w, '0');

export function formatDate(date, tz = LOCAL_TZ) {
  const p = partsIn(date, tz);
  const ms = ((date.getTime() % 1000) + 1000) % 1000;
  return `${p.y}-${pad(p.mo)}-${pad(p.d)} ${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}.${pad(ms, 3)}`;
}

export function relative(date, now = Date.now()) {
  const diff = date.getTime() - now;
  const abs = Math.abs(diff);
  const units = [
    ['年', 365 * 864e5],
    ['个月', 30 * 864e5],
    ['天', 864e5],
    ['小时', 36e5],
    ['分钟', 6e4],
    ['秒', 1e3],
  ];
  for (const [name, size] of units) {
    if (abs >= size) return `${Math.floor(abs / size)} ${name}${diff < 0 ? '前' : '后'}`;
  }
  return '刚刚';
}

export function describeTime(date, tz = LOCAL_TZ) {
  const ms = date.getTime();
  return {
    秒: String(Math.floor(ms / 1000)),
    毫秒: String(ms),
    [`本地 (${tz})`]: formatDate(date, tz),
    UTC: formatDate(date, 'UTC'),
    'ISO 8601': date.toISOString(),
    'RFC 2822': date.toUTCString(),
    相对: relative(date),
  };
}
