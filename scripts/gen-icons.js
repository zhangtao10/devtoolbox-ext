// 生成插件图标 PNG（无外部依赖）：圆角渐变方块 + 白色 "{ }"。
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};

// 在 0..1 坐标系判断是否落在 "{" 或 "}" 笔画上
function brace(x, y, cx, dir) {
  const t = 0.055; // 笔画半宽
  const top = 0.28, bot = 0.72, mid = 0.5, arm = 0.07;
  const vx = cx + dir * 0.0;
  if (Math.abs(x - vx) < t && y > top + arm && y < bot - arm && Math.abs(y - mid) > 0.035) return true;
  if (Math.abs(y - top) < t && (x - vx) * -dir < 0.12 && (x - vx) * -dir > -t) return true;
  if (Math.abs(y - bot) < t && (x - vx) * -dir < 0.12 && (x - vx) * -dir > -t) return true;
  if (Math.abs(y - mid) < t && (x - vx) * dir < 0.1 && (x - vx) * dir > -t) return true;
  if (Math.abs(x - vx) < t && (Math.abs(y - (top + arm / 2)) < arm || Math.abs(y - (bot - arm / 2)) < arm)) return true;
  return false;
}

function png(size) {
  const ss = 4; // 超采样抗锯齿
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const r0 = 0.22;
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let inBox = 0, inGlyph = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const x = (px + (sx + 0.5) / ss) / size, y = (py + (sy + 0.5) / ss) / size;
        const dx = Math.max(r0 - x, x - (1 - r0), 0), dy = Math.max(r0 - y, y - (1 - r0), 0);
        if (dx * dx + dy * dy <= r0 * r0) {
          inBox++;
          if (brace(x, y, 0.36, -1) || brace(x, y, 0.64, 1)) inGlyph++;
        }
      }
      const n = ss * ss, a = inBox / n, g = inGlyph / Math.max(inBox, 1);
      const t = (px + py) / (2 * size);
      const bg = [Math.round(79 + (124 - 79) * t), Math.round(70 + (58 - 70) * t), Math.round(229 + (237 - 229) * t)];
      const o = py * (size * 4 + 1) + 1 + px * 4;
      raw[o] = Math.round(bg[0] + (255 - bg[0]) * g);
      raw[o + 1] = Math.round(bg[1] + (255 - bg[1]) * g);
      raw[o + 2] = Math.round(bg[2] + (255 - bg[2]) * g);
      raw[o + 3] = Math.round(a * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const s of [16, 32, 48, 128]) writeFileSync(new URL(`../icons/${s}.png`, import.meta.url), png(s));
console.log('icons generated');
