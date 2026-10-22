// 注入到当前网页：EyeDropper 需要页面内的用户手势，因此先显示一个浮层按钮让用户点击。
(() => {
  const ID = '__devtoolbox_picker__';
  document.getElementById(ID)?.remove();

  const host = document.createElement('div');
  host.id = ID;
  host.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `
    <style>
      .box{font:13px/1.4 system-ui,-apple-system,"PingFang SC",sans-serif;background:#1f2330;color:#fff;border-radius:12px;
        padding:12px;box-shadow:0 8px 30px rgba(0,0,0,.35);min-width:220px}
      button{font:inherit;border:0;border-radius:8px;padding:7px 12px;cursor:pointer}
      .go{background:#6d5ef5;color:#fff;width:100%;transition:filter .12s}
      .go:hover{filter:brightness(1.12)}
      .x:hover{color:#fff}
      .x{position:absolute;top:6px;right:8px;background:none;color:#aaa;padding:2px 6px}
      .row{display:flex;align-items:center;gap:10px;margin-top:10px}
      .sw{width:36px;height:36px;border-radius:8px;border:1px solid rgba(255,255,255,.3)}
      .v{font-family:ui-monospace,Menlo,monospace;cursor:pointer}
      .v:hover{text-decoration:underline}
      .tip{color:#9aa0ac;font-size:12px;margin-top:6px}
      .err{color:#ffa8a8}
    </style>
    <div class="box">
      <button class="x" title="关闭">✕</button>
      <button class="go">🎯 点击开始取色</button>
      <div class="out"></div>
    </div>`;
  document.documentElement.append(host);

  const out = root.querySelector('.out');
  const close = () => host.remove();
  root.querySelector('.x').onclick = close;
  const onKey = (e) => e.key === 'Escape' && (close(), removeEventListener('keydown', onKey, true));
  addEventListener('keydown', onKey, true);

  if (!('EyeDropper' in window)) {
    root.querySelector('.go').remove();
    out.innerHTML = '<div class="tip err">当前页面不支持 EyeDropper（需 Chrome 95+ 且为 HTTPS 页面）。</div>';
    return;
  }

  const toRgb = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
  };

  root.querySelector('.go').onclick = async () => {
    try {
      const { sRGBHex } = await new EyeDropper().open();
      const hex = sRGBHex.startsWith('#') ? sRGBHex.toUpperCase() : sRGBHex;
      const rgb = hex.startsWith('#') ? toRgb(hex) : '';
      out.innerHTML = `<div class="row"><div class="sw"></div><div>
        <div class="v" data-v="${hex}">${hex}</div><div class="v" data-v="${rgb}">${rgb}</div></div></div>
        <div class="tip">已复制 HEX · 点击数值可复制 · 可在工具箱「颜色转换」中查看更多格式</div>`;
      out.querySelector('.sw').style.background = hex;
      out.querySelectorAll('.v').forEach((el) => (el.onclick = () => navigator.clipboard.writeText(el.dataset.v)));
      root.querySelector('.go').textContent = '🎯 继续取色';
      navigator.clipboard.writeText(hex).catch(() => {});
      const { pickHistory = [] } = await chrome.storage.local.get('pickHistory');
      await chrome.storage.local.set({ pickHistory: [hex, ...pickHistory.filter((c) => c !== hex)].slice(0, 30) });
    } catch (e) {
      if (e?.name !== 'AbortError') out.innerHTML = `<div class="tip err">取色失败：${e?.message ?? e}</div>`;
    }
  };
})();
