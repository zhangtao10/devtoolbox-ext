// curl 命令解析：支持 Chrome / Firefox “复制为 cURL”（bash 与 cmd 两种格式）的常见写法，转换为 fetch 参数。

export const isCurl = (text) => /^\s*curl(\.exe)?\s/.test(text);

class CurlError extends Error {}

const ANSI_C = { n: '\n', t: '\t', r: '\r', a: '\x07', b: '\b', e: '\x1b', f: '\f', v: '\v', '\\': '\\', "'": "'", '"': '"', '?': '?' };

// 按 shell 规则拆分参数：单引号、双引号、$'…'、反斜杠转义与续行
function tokenize(text) {
  // Windows cmd 格式：^ 转义任意字符，行尾 ^ 为续行
  if (/\^\r?\n|\^"/.test(text)) text = text.replace(/\^\r?\n/g, ' ').replace(/\^(.)/g, '$1');
  const args = [];
  let cur = null; // 当前参数，null 表示尚未开始
  let i = 0;
  const add = (s) => (cur = (cur ?? '') + s);
  while (i < text.length) {
    const c = text[i];
    if (c === '\\') {
      const n = text[i + 1];
      if (n === '\n') i += 2;
      else if (n === '\r' && text[i + 2] === '\n') i += 3;
      else {
        if (n !== undefined) add(n);
        i += 2;
      }
    } else if (/\s/.test(c)) {
      if (cur !== null) args.push(cur);
      cur = null;
      i++;
    } else if (c === "'") {
      const end = text.indexOf("'", i + 1);
      if (end < 0) throw new CurlError('单引号未闭合');
      add(text.slice(i + 1, end));
      i = end + 1;
    } else if (c === '$' && text[i + 1] === "'") {
      i += 2;
      let s = '';
      for (;;) {
        const ch = text[i];
        if (ch === undefined) throw new CurlError("$'…' 引号未闭合");
        if (ch === "'") break;
        if (ch !== '\\') {
          s += ch;
          i++;
          continue;
        }
        const e = text[i + 1];
        const hex = /^x([0-9a-fA-F]{1,2})|^u([0-9a-fA-F]{1,4})|^U([0-9a-fA-F]{1,8})|^([0-7]{1,3})/.exec(text.slice(i + 1, i + 10));
        if (hex) {
          const [all, x, u, U, oct] = hex;
          s += x || oct ? String.fromCharCode(parseInt(x ?? oct, x ? 16 : 8)) : String.fromCodePoint(parseInt(u ?? U, 16));
          i += 1 + all.length;
        } else {
          s += ANSI_C[e] ?? `\\${e}`;
          i += 2;
        }
      }
      add(s);
      i++;
    } else if (c === '"') {
      i++;
      let s = '';
      for (;;) {
        const ch = text[i];
        if (ch === undefined) throw new CurlError('双引号未闭合');
        if (ch === '"') break;
        if (ch === '\\' && '"\\$`\n'.includes(text[i + 1])) {
          if (text[i + 1] !== '\n') s += text[i + 1];
          i += 2;
        } else {
          s += ch;
          i++;
        }
      }
      add(s);
      i++;
    } else {
      add(c);
      i++;
    }
  }
  if (cur !== null) args.push(cur);
  return args;
}

// 需要参数但对请求没有影响的选项，跳过其参数，避免误当成 URL
const IGNORED_WITH_ARG = new Set([
  '-o', '-m', '-x', '-w', '-r', '-C', '-c', '-E', '-K', '-y', '-Y', '-z', '-Q', '-t', '-T', '-U',
  '--output', '--max-time', '--connect-timeout', '--proxy', '--proxy-user', '--retry', '--retry-delay', '--retry-max-time',
  '--write-out', '--range', '--continue-at', '--cookie-jar', '--cert', '--key', '--cacert', '--capath', '--config',
  '--resolve', '--connect-to', '--limit-rate', '--max-redirs', '--interface', '--dns-servers', '--upload-file', '--user-agent-file',
]);
const SHORT_WITH_ARG = 'XHdbuAeFoxmwrCcEKyYzQtTU';
const LONG = {
  '-X': 'request', '-H': 'header', '-d': 'data', '-b': 'cookie', '-u': 'user', '-A': 'user-agent', '-e': 'referer', '-F': 'form', '-G': 'get', '-I': 'head',
};
const WITH_ARG = new Set(['request', 'header', 'data', 'data-raw', 'data-binary', 'data-ascii', 'data-urlencode', 'json', 'cookie', 'user', 'user-agent', 'referer', 'form', 'form-string', 'url', 'oauth2-bearer']);

const base64 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));

function urlencodeData(s) {
  const m = /^([^=@]*)([=@])([\s\S]*)$/.exec(s);
  if (!m) return encodeURIComponent(s);
  if (m[2] === '@') throw new CurlError('不支持从文件读取请求体（@文件）');
  return m[1] ? `${m[1]}=${encodeURIComponent(m[3])}` : encodeURIComponent(m[3]);
}

// 解析 curl 命令，返回 { ok, method, url, headers: [[名称, 值]], body, form? } 或 { ok: false, message }
export function parseCurl(text) {
  try {
    return { ok: true, ...build(tokenize(text.trim())) };
  } catch (e) {
    if (!(e instanceof CurlError)) throw e;
    return { ok: false, message: e.message };
  }
}

function build(args) {
  if (!/^curl(\.exe)?$/.test(args[0] ?? '')) throw new CurlError('不是 curl 命令');
  let method;
  let url;
  let get = false;
  let head = false;
  const headers = [];
  const data = [];
  const form = [];
  const hasHeader = (name) => headers.some(([k]) => k.toLowerCase() === name.toLowerCase());

  const apply = (opt, val) => {
    switch (opt) {
      case 'request': method = val.toUpperCase(); break;
      case 'header': {
        const m = /^([^:;]+)([:;])\s*([\s\S]*)$/.exec(val);
        if (m && (m[2] === ';' || m[3])) headers.push([m[1].trim(), m[2] === ';' ? '' : m[3]]);
        break;
      }
      case 'data': case 'data-ascii': case 'data-binary':
        if (val.startsWith('@')) throw new CurlError('不支持从文件读取请求体（@文件）');
        data.push(val);
        break;
      case 'data-raw': data.push(val); break;
      case 'data-urlencode': data.push(urlencodeData(val)); break;
      case 'json':
        if (val.startsWith('@')) throw new CurlError('不支持从文件读取请求体（@文件）');
        data.push(val);
        if (!hasHeader('Content-Type')) headers.push(['Content-Type', 'application/json']);
        if (!hasHeader('Accept')) headers.push(['Accept', 'application/json']);
        break;
      case 'cookie': if (val.includes('=')) headers.push(['Cookie', val]); break; // 不含 = 时是 cookie 文件，忽略
      case 'user': headers.push(['Authorization', `Basic ${base64(val)}`]); break;
      case 'oauth2-bearer': headers.push(['Authorization', `Bearer ${val}`]); break;
      case 'user-agent': headers.push(['User-Agent', val]); break;
      case 'referer': headers.push(['Referer', val]); break;
      case 'form': case 'form-string': {
        const eq = val.indexOf('=');
        if (eq < 0) throw new CurlError(`无效的表单字段：${val}`);
        const v = val.slice(eq + 1);
        if (opt === 'form' && /^[@<]/.test(v)) throw new CurlError('不支持上传文件（-F name=@文件）');
        form.push([val.slice(0, eq), v]);
        break;
      }
      case 'url': url ??= val; break;
      case 'get': get = true; break;
      case 'head': head = true; break;
    }
  };

  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    const next = () => {
      if (i + 1 >= args.length) throw new CurlError(`选项 ${a} 缺少参数`);
      return args[++i];
    };
    if (a.startsWith('--') && a.length > 2) {
      const eq = a.indexOf('=');
      const name = eq < 0 ? a.slice(2) : a.slice(2, eq);
      if (WITH_ARG.has(name)) apply(name, eq < 0 ? next() : a.slice(eq + 1));
      else if (IGNORED_WITH_ARG.has(`--${name}`)) eq < 0 && next();
      else apply(name);
    } else if (a.startsWith('-') && a.length > 1) {
      // 短选项可合并（-sSL）或直接接参数（-XPOST）
      for (let j = 1; j < a.length; j++) {
        const flag = `-${a[j]}`;
        if (!SHORT_WITH_ARG.includes(a[j])) {
          if (LONG[flag]) apply(LONG[flag]);
          continue;
        }
        const val = j + 1 < a.length ? a.slice(j + 1) : next();
        if (LONG[flag]) apply(LONG[flag], val);
        break;
      }
    } else {
      url ??= a;
    }
  }

  if (!url) throw new CurlError('缺少 URL');
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(url)) url = `http://${url}`;
  let body;
  if (data.length && get) {
    url += (url.includes('?') ? '&' : '?') + data.join('&');
  } else if (data.length) {
    body = data.join('&');
    if (!hasHeader('Content-Type')) headers.push(['Content-Type', 'application/x-www-form-urlencoded']);
  }
  method ??= head ? 'HEAD' : get ? 'GET' : body !== undefined || form.length ? 'POST' : 'GET';
  return form.length ? { method, url, headers, body, form } : { method, url, headers, body };
}

// 浏览器不允许脚本设置的请求头（fetch 会忽略），需通过 declarativeNetRequest 改写
const FORBIDDEN = new Set([
  'accept-charset', 'accept-encoding', 'access-control-request-headers', 'access-control-request-method', 'cookie',
  'cookie2', 'date', 'dnt', 'origin', 'referer', 'set-cookie', 'user-agent', 'via',
]);
// 由网络层管理的连接级请求头，改写会破坏请求，直接丢弃
const NETWORK = new Set(['host', 'content-length', 'connection', 'keep-alive', 'expect', 'te', 'trailer', 'transfer-encoding', 'upgrade']);

// 转为 fetch(url, init)。restricted 为 fetch 无法设置、需另行改写的请求头 [[名称, 值]]，dropped 为丢弃的请求头名称
export function toFetch(req) {
  const restricted = [];
  const dropped = [];
  const headers = req.headers.filter(([k, v]) => {
    const n = k.toLowerCase();
    if (NETWORK.has(n) || n.startsWith('proxy-')) dropped.push(k);
    else if (FORBIDDEN.has(n) || n.startsWith('sec-')) restricted.push([k, v]);
    else return true;
    return false;
  });
  // curl 中带 Cookie 时不再附带浏览器自身的 Cookie，响应的 Set-Cookie 也不会写入浏览器
  const hasCookie = restricted.some(([k]) => k.toLowerCase() === 'cookie');
  const init = { method: req.method, headers, credentials: hasCookie ? 'omit' : 'include' };
  if (req.form) {
    // multipart 的 Content-Type 带 boundary，必须由浏览器生成
    init.headers = headers.filter(([k]) => k.toLowerCase() !== 'content-type');
    init.body = new FormData();
    for (const [k, v] of req.form) init.body.append(k, v);
  } else if (req.body !== undefined && req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = req.body;
  }
  return { url: req.url, init, restricted, dropped };
}
