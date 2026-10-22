// 后台线程：大 JSON 的解析、格式化与 diff 都在这里完成，避免阻塞页面。
import { parseJSON, diffJSON, sortKeys, lineDiff } from './lib/json.js';

const countNodes = (v) => {
  if (!v || typeof v !== 'object') return 1;
  let n = 1;
  for (const c of Object.values(v)) n += countNodes(c);
  return n;
};

const handlers = {
  parse({ text, loose, indent }) {
    const r = parseJSON(text, { loose });
    if (!r.ok) return r;
    const pretty = JSON.stringify(r.value, null, indent);
    return { ok: true, value: r.value, pretty, nodes: countNodes(r.value), bytes: new Blob([text]).size };
  },

  diff({ left, right, loose, sort }) {
    const parsed = [];
    for (const [text, side] of [[left, 'left'], [right, 'right']]) {
      const r = parseJSON(text, { loose });
      if (!r.ok) return { ...r, side };
      parsed.push(sort ? sortKeys(r.value) : r.value);
    }
    const [a, b] = parsed;
    const ops = lineDiff(JSON.stringify(a, null, 2).split('\n'), JSON.stringify(b, null, 2).split('\n'));
    return { ok: true, diffs: diffJSON(a, b), rows: pairRows(ops), approx: !!ops.approx };
  },
};

// 把连续的 del/add 配对成同一行，便于左右对照。行用紧凑数组 [type, 左行号, 左文本, 右行号, 右文本] 传回主线程。
function pairRows(ops) {
  const rows = [];
  let ln = 0;
  let rn = 0;
  let dels = [];
  let adds = [];
  const flush = () => {
    const n = Math.max(dels.length, adds.length);
    for (let i = 0; i < n; i++) {
      const l = dels[i];
      const r = adds[i];
      const type = l !== undefined && r !== undefined ? 'chg' : l !== undefined ? 'del' : 'add';
      rows.push([type, l === undefined ? 0 : ++ln, l ?? '', r === undefined ? 0 : ++rn, r ?? '']);
    }
    dels = [];
    adds = [];
  };
  for (const op of ops) {
    if (op.type === 'del') dels.push(op.left);
    else if (op.type === 'add') adds.push(op.right);
    else {
      flush();
      rows.push(['same', ++ln, op.left, ++rn, op.right]);
    }
  }
  flush();
  return rows;
}

self.onmessage = ({ data: { id, type, payload } }) => {
  try {
    self.postMessage({ id, result: handlers[type](payload) });
  } catch (e) {
    self.postMessage({ id, error: e.message });
  }
};
