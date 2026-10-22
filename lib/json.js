// JSON 解析（带行列号错误定位、宽松模式）与结构化 diff。

class ParseError extends Error {
  constructor(message, pos) {
    super(message);
    this.pos = pos;
  }
}

function parse(text, loose) {
  let i = 0;

  const fail = (msg) => {
    throw new ParseError(msg, i);
  };

  const skipWs = () => {
    for (;;) {
      const c = text[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '﻿') {
        i++;
      } else if (loose && c === '/' && text[i + 1] === '/') {
        while (i < text.length && text[i] !== '\n') i++;
      } else if (loose && c === '/' && text[i + 1] === '*') {
        const end = text.indexOf('*/', i + 2);
        if (end < 0) fail('注释未闭合');
        i = end + 2;
      } else {
        return;
      }
    }
  };

  const expect = (ch) => {
    if (text[i] !== ch) fail(`期望 '${ch}'，实际为 ${describe(text[i])}`);
    i++;
  };

  const describe = (c) => (c === undefined ? '文本结束' : `'${c}'`);

  const parseString = () => {
    const quote = text[i];
    i++;
    let out = '';
    for (;;) {
      const c = text[i];
      if (c === undefined) fail('字符串未闭合');
      if (c === quote) {
        i++;
        return out;
      }
      if (c === '\\') {
        const e = text[i + 1];
        const map = { '"': '"', "'": "'", '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
        if (e === 'u') {
          const hex = text.slice(i + 2, i + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('无效的 \\u 转义');
          out += String.fromCharCode(parseInt(hex, 16));
          i += 6;
        } else if (e in map && (e !== "'" || loose)) {
          out += map[e];
          i += 2;
        } else {
          i++;
          fail(`无效的转义字符 ${describe(e)}`);
        }
        continue;
      }
      if (c < ' ') fail('字符串中包含未转义的控制字符');
      out += c;
      i++;
    }
  };

  const parseNumber = () => {
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i));
    if (!m) fail(`意外的字符 ${describe(text[i])}`);
    i += m[0].length;
    return Number(m[0]);
  };

  const parseValue = () => {
    skipWs();
    const c = text[i];
    if (c === '{') return parseObject();
    if (c === '[') return parseArray();
    if (c === '"' || (loose && c === "'")) return parseString();
    if (c === '-' || (c >= '0' && c <= '9')) return parseNumber();
    for (const [word, val] of [['true', true], ['false', false], ['null', null]]) {
      if (text.startsWith(word, i)) {
        i += word.length;
        return val;
      }
    }
    fail(`意外的${c === undefined ? '文本结束' : `字符 '${c}'`}`);
  };

  const parseKey = () => {
    const c = text[i];
    if (c === '"' || (loose && c === "'")) return parseString();
    if (loose) {
      const m = /^[A-Za-z_$][\w$]*/.exec(text.slice(i));
      if (m) {
        i += m[0].length;
        return m[0];
      }
    }
    fail(`期望属性名，实际为 ${describe(c)}`);
  };

  const parseObject = () => {
    i++;
    const obj = {};
    skipWs();
    if (text[i] === '}') {
      i++;
      return obj;
    }
    for (;;) {
      skipWs();
      if (loose && text[i] === '}') {
        i++;
        return obj;
      }
      const key = parseKey();
      skipWs();
      expect(':');
      obj[key] = parseValue();
      skipWs();
      if (text[i] === ',') {
        i++;
        continue;
      }
      if (text[i] === '}') {
        i++;
        return obj;
      }
      fail(`期望 ',' 或 '}'，实际为 ${describe(text[i])}`);
    }
  };

  const parseArray = () => {
    i++;
    const arr = [];
    skipWs();
    if (text[i] === ']') {
      i++;
      return arr;
    }
    for (;;) {
      skipWs();
      if (loose && text[i] === ']') {
        i++;
        return arr;
      }
      arr.push(parseValue());
      skipWs();
      if (text[i] === ',') {
        i++;
        continue;
      }
      if (text[i] === ']') {
        i++;
        return arr;
      }
      fail(`期望 ',' 或 ']'，实际为 ${describe(text[i])}`);
    }
  };

  const value = parseValue();
  skipWs();
  if (i < text.length) fail(`JSON 结束后存在多余内容 ${describe(text[i])}`);
  return value;
}

function lineCol(text, pos) {
  const before = text.slice(0, pos).split('\n');
  return { line: before.length, column: before[before.length - 1].length + 1 };
}

export function parseJSON(text, { loose = false } = {}) {
  try {
    return { ok: true, value: parse(text, loose) };
  } catch (e) {
    if (!(e instanceof ParseError)) throw e;
    return { ok: false, message: e.message, pos: e.pos, ...lineCol(text, e.pos) };
  }
}

// 一键修复：用容错解析器读取有问题的 JSON，返回修复后的值与修复项列表。
// 覆盖常见问题：注释、尾逗号、缺逗号/冒号、单引号/中文引号、无引号键与值、Python/JS 字面量、
// 字符串内未转义的引号与换行、截断（未闭合的括号与字符串）、多余括号、代码块 / JSONP 包裹、多段 JSON。
const QUOTE_CLOSERS = { '"': '"', "'": "'", '`': '`', '“': '”“"', '”': '”“"', '‘': '’‘\'', '’': '’‘\'' };
const LITERALS = { true: true, false: false, null: null, True: true, False: false, None: null, undefined: null, NaN: null, Infinity: null, '-Infinity': null };
const VALUE_END = ',}]';

export function repairJSON(input) {
  const strict = parseJSON(input);
  if (strict.ok) return { ok: true, value: strict.value, fixes: [] };

  const fixes = new Set();
  const note = (m) => fixes.add(m);
  let text = input.replace(/^﻿/, '');
  const fence = /^\s*```[\w-]*[^\S\n]*\n([\s\S]*?)\n?\s*```\s*$/.exec(text);
  if (fence) {
    text = fence[1];
    note('去除 Markdown 代码块');
  }
  const jsonp = /^\s*[A-Za-z_$][\w$.]*\s*\(([\s\S]*)\)\s*;?\s*$/.exec(text);
  if (jsonp) {
    text = jsonp[1];
    note('去除 JSONP 包裹');
  }
  if (!text.trim()) return { ok: false, message: '内容为空' };

  let i = 0;

  const skipWs = () => {
    for (;;) {
      const c = text[i];
      if (c !== undefined && /\s/.test(c)) {
        i++;
      } else if ((c === '/' && text[i + 1] === '/') || c === '#') {
        while (i < text.length && text[i] !== '\n') i++;
        note('移除注释');
      } else if (c === '/' && text[i + 1] === '*') {
        const end = text.indexOf('*/', i + 2);
        i = end < 0 ? text.length : end + 2;
        note('移除注释');
      } else {
        return;
      }
    }
  };

  // 引号之后（同一行内）的下一个字符是分隔符、换行或另一个引号时，才认为字符串在此结束
  const endsString = (j) => {
    while (text[j] === ' ' || text[j] === '\t') j++;
    const n = text[j];
    return n === undefined || n === '\n' || n === '\r' || n === '/' || n === ':' || VALUE_END.includes(n) || n in QUOTE_CLOSERS;
  };

  const parseString = (isKey) => {
    const open = text[i];
    const closers = QUOTE_CLOSERS[open];
    if (open !== '"') note('统一为双引号');
    i++;
    let out = '';
    for (;;) {
      const c = text[i];
      if (c === undefined) {
        note('补全未闭合的字符串');
        return out;
      }
      if (closers.includes(c)) {
        if (isKey || endsString(i + 1)) {
          i++;
          return out;
        }
        note('转义字符串内的引号');
        out += c;
        i++;
        continue;
      }
      if (c === '\\') {
        const e = text[i + 1];
        const map = { '"': '"', "'": "'", '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
        const hex = text.slice(i + 2, i + 6);
        if (e === 'u' && /^[0-9a-fA-F]{4}$/.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16));
          i += 6;
        } else if (e !== undefined && e !== 'u' && e in map) {
          out += map[e];
          i += 2;
        } else {
          note('修正无效的转义');
          out += '\\';
          i++;
        }
        continue;
      }
      if (c < ' ') note('转义字符串中的换行等控制字符');
      out += c;
      i++;
    }
  };

  const parseNumber = () => {
    const rest = text.slice(i, i + 400);
    const m = /^[+-]?0[xX][0-9a-fA-F]+/.exec(rest) || /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(rest);
    if (!m || /[\w$.]/.test(text[i + m[0].length] ?? '')) return undefined;
    if (!/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(m[0])) note('修正数字格式');
    i += m[0].length;
    const s = m[0].replace(/^\+/, '');
    return /0x/i.test(s) ? (s[0] === '-' ? -1 : 1) * parseInt(s.replace(/^-/, ''), 16) : Number(s);
  };

  const parseValue = () => {
    skipWs();
    const c = text[i];
    if (c === undefined || VALUE_END.includes(c)) {
      note('补全缺失的值');
      return null;
    }
    if (c === '{') return parseObject();
    if (c === '[') return parseArray();
    if (c in QUOTE_CLOSERS) return parseString(false);
    if (/[-+.\d]/.test(c)) {
      const n = parseNumber();
      if (n !== undefined) return n;
    }
    // 裸词：字面量或无引号字符串，读到分隔符或行尾为止
    const start = i;
    while (i < text.length && !VALUE_END.includes(text[i]) && text[i] !== '\n' && !(text[i] === '/' && '/*'.includes(text[i + 1]))) i++;
    const word = text.slice(start, i).trim();
    if (word in LITERALS) {
      if (word !== 'true' && word !== 'false' && word !== 'null') note(`替换非法字面量 ${word}`);
      return LITERALS[word];
    }
    note('为字符串值补上引号');
    return word;
  };

  const parseKey = () => {
    const c = text[i];
    if (c in QUOTE_CLOSERS) return parseString(true);
    const m = /^[^\s:,{}[\]"'“”‘’]+/.exec(text.slice(i, i + 1000));
    if (!m) return null;
    i += m[0].length;
    note('为键名补上引号');
    return m[0];
  };

  // 对象与数组共用的循环：处理多余/尾随/缺失的逗号、不匹配或缺失的右括号
  const parseContainer = (close, readItem) => {
    i++;
    let afterComma = false;
    let first = true;
    for (;;) {
      skipWs();
      const start = i;
      const c = text[i];
      if (c === undefined) {
        note('补全缺失的右括号');
        return;
      }
      if (c === close) {
        if (afterComma) note('删除尾逗号');
        i++;
        return;
      }
      if (c === '}' || c === ']') {
        note('修正不匹配的括号');
        return;
      }
      if (c === ',') {
        if (afterComma || first) note('删除多余的逗号');
        afterComma = true;
        i++;
        continue;
      }
      if (!first && !afterComma) note('补全缺失的逗号');
      first = afterComma = false;
      readItem();
      if (i === start) {
        note('删除无法识别的字符');
        i++;
      }
    }
  };

  const parseObject = () => {
    const obj = {};
    parseContainer('}', () => {
      const key = parseKey();
      if (key === null) return;
      skipWs();
      if (text[i] === ':' || text[i] === '=') {
        if (text[i] === '=') note('补全缺失的冒号');
        i++;
      } else {
        note('补全缺失的冒号');
      }
      obj[key] = parseValue();
    });
    return obj;
  };

  const parseArray = () => {
    const arr = [];
    parseContainer(']', () => {
      if (text[i] === ':') return;
      arr.push(parseValue());
    });
    return arr;
  };

  skipWs();
  if (!/[{["'`“‘\d.+-]/.test(text[i] ?? '')) {
    const m = /[{[]/.exec(text.slice(i));
    if (m) {
      i += m.index;
      note('去除前置内容');
    }
  }
  const values = [parseValue()];
  for (;;) {
    skipWs();
    const c = text[i];
    if (c === undefined) break;
    if (c === '{' || c === '[') {
      values.push(parseValue());
    } else if (c === '}' || c === ']') {
      note('删除多余的右括号');
      i++;
    } else if (c === ',' || c === ';') {
      i++;
    } else {
      note('删除末尾多余内容');
      break;
    }
  }
  if (values.length > 1) note('将多段 JSON 合并为数组');
  return { ok: true, value: values.length > 1 ? values : values[0], fixes: [...fixes] };
}

export function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, sortKeys(value[k])])
    );
  }
  return value;
}

const kind = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

export function keyPath(base, key) {
  if (typeof key === 'number') return `${base}[${key}]`;
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `${base}.${key}` : `${base}[${JSON.stringify(key)}]`;
}

export function diffJSON(left, right, path = '$', out = []) {
  const kl = kind(left);
  const kr = kind(right);
  if (kl !== kr) {
    out.push({ type: 'changed', path, left, right });
  } else if (kl === 'array') {
    const n = Math.max(left.length, right.length);
    for (let i = 0; i < n; i++) {
      const p = keyPath(path, i);
      if (i >= right.length) out.push({ type: 'removed', path: p, left: left[i] });
      else if (i >= left.length) out.push({ type: 'added', path: p, right: right[i] });
      else diffJSON(left[i], right[i], p, out);
    }
  } else if (kl === 'object') {
    for (const k of Object.keys(left)) {
      const p = keyPath(path, k);
      if (!Object.hasOwn(right, k)) out.push({ type: 'removed', path: p, left: left[k] });
      else diffJSON(left[k], right[k], p, out);
    }
    for (const k of Object.keys(right)) {
      if (!Object.hasOwn(left, k)) out.push({ type: 'added', path: keyPath(path, k), right: right[k] });
    }
  } else if (left !== right) {
    out.push({ type: 'changed', path, left, right });
  }
  return out;
}

// 按行 diff：线性空间 Myers 算法（middle snake 二分），时间 O((N+M)·D)，内存 O(N+M)。
// 计算量超过 budget 时，剩余未对齐部分直接输出为“整块删除 + 整块新增”，结果仍然正确但不保证最短，并标记 approx。
export function lineDiff(left, right, { budget = 5e7 } = {}) {
  // 行文本映射为整数，比较更快
  const ids = new Map();
  const toId = (line) => {
    let id = ids.get(line);
    if (id === undefined) ids.set(line, (id = ids.size));
    return id;
  };
  const A = Int32Array.from(left, toId);
  const B = Int32Array.from(right, toId);
  const out = [];
  let approx = false;

  const emit = (type, aLo, aHi, bLo, bHi) => {
    if (type === 'same') for (let i = aLo, j = bLo; i < aHi; i++, j++) out.push({ type, left: left[i], right: right[j] });
    if (type === 'del') for (let i = aLo; i < aHi; i++) out.push({ type, left: left[i] });
    if (type === 'add') for (let j = bLo; j < bHi; j++) out.push({ type, right: right[j] });
  };

  // 在 A[aLo,aHi) 与 B[bLo,bHi) 中寻找 middle snake，返回分割点 [x, y]（绝对下标）；超预算或无公共行时返回 null
  const bisect = (aLo, aHi, bLo, bHi) => {
    const n = aHi - aLo;
    const m = bHi - bLo;
    const maxD = Math.ceil((n + m) / 2);
    const off = maxD;
    const len = 2 * maxD + 2;
    const v1 = new Int32Array(len).fill(-1);
    const v2 = new Int32Array(len).fill(-1);
    v1[off + 1] = 0;
    v2[off + 1] = 0;
    const delta = n - m;
    const front = delta % 2 !== 0;
    let k1start = 0, k1end = 0, k2start = 0, k2end = 0;
    for (let d = 0; d < maxD; d++) {
      if (budget <= 0) return null;
      budget -= 4 * d + 2;
      for (let k1 = -d + k1start; k1 <= d - k1end; k1 += 2) {
        const k1o = off + k1;
        let x1 = k1 === -d || (k1 !== d && v1[k1o - 1] < v1[k1o + 1]) ? v1[k1o + 1] : v1[k1o - 1] + 1;
        let y1 = x1 - k1;
        while (x1 < n && y1 < m && A[aLo + x1] === B[bLo + y1]) x1++, y1++;
        v1[k1o] = x1;
        if (x1 > n) k1end += 2;
        else if (y1 > m) k1start += 2;
        else if (front) {
          const k2o = off + delta - k1;
          if (k2o >= 0 && k2o < len && v2[k2o] !== -1 && x1 >= n - v2[k2o]) return [aLo + x1, bLo + y1];
        }
      }
      for (let k2 = -d + k2start; k2 <= d - k2end; k2 += 2) {
        const k2o = off + k2;
        let x2 = k2 === -d || (k2 !== d && v2[k2o - 1] < v2[k2o + 1]) ? v2[k2o + 1] : v2[k2o - 1] + 1;
        let y2 = x2 - k2;
        while (x2 < n && y2 < m && A[aHi - x2 - 1] === B[bHi - y2 - 1]) x2++, y2++;
        v2[k2o] = x2;
        if (x2 > n) k2end += 2;
        else if (y2 > m) k2start += 2;
        else if (!front) {
          const k1o = off + delta - k2;
          if (k1o >= 0 && k1o < len && v1[k1o] !== -1) {
            const x1 = v1[k1o];
            const y1 = x1 - (k1o - off);
            if (x1 >= n - x2) return [aLo + x1, bLo + y1];
          }
        }
      }
    }
    return null;
  };

  // 显式栈代替递归，避免深层调用栈溢出；任务按输出顺序逆序入栈
  const stack = [['range', 0, A.length, 0, B.length]];
  while (stack.length) {
    const task = stack.pop();
    if (task[0] !== 'range') {
      emit(...task);
      continue;
    }
    let [, aLo, aHi, bLo, bHi] = task;
    // 去掉公共前缀
    const pre = aLo;
    while (aLo < aHi && bLo < bHi && A[aLo] === B[bLo]) aLo++, bLo++;
    emit('same', pre, aLo, bLo - (aLo - pre), bLo);
    // 去掉公共后缀（最后输出）
    let sa = aHi, sb = bHi;
    while (aLo < sa && bLo < sb && A[sa - 1] === B[sb - 1]) sa--, sb--;
    const suffix = ['same', sa, aHi, sb, bHi];
    aHi = sa;
    bHi = sb;

    if (aLo === aHi || bLo === bHi) {
      emit('del', aLo, aHi, 0, 0);
      emit('add', 0, 0, bLo, bHi);
      emit(...suffix);
      continue;
    }
    const split = bisect(aLo, aHi, bLo, bHi);
    if (!split) {
      if (budget <= 0) approx = true;
      emit('del', aLo, aHi, 0, 0);
      emit('add', 0, 0, bLo, bHi);
      emit(...suffix);
      continue;
    }
    const [x, y] = split;
    stack.push(suffix, ['range', x, aHi, y, bHi], ['range', aLo, x, bLo, y]);
  }
  if (approx) out.approx = true;
  return out;
}
