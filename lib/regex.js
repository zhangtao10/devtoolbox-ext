// 正则测试：匹配列表、分组、替换，以及常用规则预设。

export const PRESETS = [
  { name: '手机号（中国大陆）', pattern: '^1[3-9]\\d{9}$', example: '13812345678' },
  { name: '邮箱', pattern: '^[\\w.+-]+@[A-Za-z0-9-]+(\\.[A-Za-z0-9-]+)+$', example: 'dev@example.com' },
  { name: '身份证号（18 位）', pattern: '^[1-9]\\d{5}(18|19|20)\\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\\d|3[01])\\d{3}[\\dXx]$', example: '11010519491231002X' },
  { name: 'URL', pattern: '^https?:\\/\\/[\\w.-]+(:\\d+)?(\\/[^\\s]*)?$', example: 'https://example.com:8080/a?b=1' },
  { name: 'IPv4', pattern: '^((25[0-5]|2[0-4]\\d|1?\\d?\\d)\\.){3}(25[0-5]|2[0-4]\\d|1?\\d?\\d)$', example: '192.168.1.1' },
  { name: '日期 YYYY-MM-DD', pattern: '^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$', example: '2026-10-21' },
  { name: '时间 HH:mm:ss', pattern: '^([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d$', example: '23:59:59' },
  { name: '十六进制颜色', pattern: '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$', example: '#FF5733' },
  { name: '中文字符', pattern: '[\\u4e00-\\u9fa5]+', flags: 'g', example: '你好 world' },
  { name: '邮政编码', pattern: '^\\d{6}$', example: '100000' },
  { name: '强密码（8+ 位，含大小写与数字）', pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).{8,}$', example: 'Abcdef12' },
  { name: '用户名（字母开头 4-16 位）', pattern: '^[a-zA-Z][a-zA-Z0-9_]{3,15}$', example: 'dev_user' },
  { name: '整数', pattern: '^-?\\d+$', example: '-42' },
  { name: '小数', pattern: '^-?\\d+\\.\\d+$', example: '3.14' },
  { name: 'UUID', pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$', example: '123e4567-e89b-12d3-a456-426614174000' },
];

export function runRegex(pattern, flags, text, replacement) {
  let re;
  try {
    re = new RegExp(pattern, flags);
  } catch (e) {
    return { ok: false, message: e.message };
  }
  const matches = [];
  const global = re.global || re.sticky;
  const scan = global ? re : new RegExp(pattern, flags + 'g');
  scan.lastIndex = 0;
  let m;
  while ((m = scan.exec(text)) !== null) {
    matches.push({ index: m.index, text: m[0], groups: m.slice(1), named: m.groups ? { ...m.groups } : undefined });
    if (!global) break;
    if (m[0] === '') scan.lastIndex++;
    if (scan.lastIndex > text.length) break;
  }
  const out = { ok: true, matches };
  if (replacement !== undefined) out.replaced = text.replace(re, replacement);
  return out;
}
