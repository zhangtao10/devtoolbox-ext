const openTool = (tool, query = '') =>
  chrome.tabs.create({ url: chrome.runtime.getURL(`app.html${query}#${tool}`) }).then(() => window.close());

document.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => openTool(b.dataset.tool)));

const msg = document.getElementById('pick-msg');
document.getElementById('pick').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const fallback = (reason) => {
    // EyeDropper 可吸取整个屏幕，工具页里一样能取到当前网页的颜色
    msg.textContent = `${reason}，已改为在工具页中取色。`;
    msg.hidden = false;
    setTimeout(() => openTool('color', '?pick=1'), 900);
  };
  try {
    const [{ result: supported }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => 'EyeDropper' in window,
    });
    if (!supported) return fallback('当前页面（非 HTTPS）不支持取色');
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['picker.js'] });
    window.close();
  } catch {
    fallback('当前页面不允许注入脚本');
  }
});

chrome.storage.local.get({ pickHistory: [] }).then(({ pickHistory }) => {
  const footer = document.getElementById('recent');
  for (const hex of pickHistory.slice(0, 10)) {
    const b = document.createElement('button');
    b.className = 'sw';
    b.title = hex;
    b.style.background = hex;
    b.addEventListener('click', () => openTool('color', `?c=${encodeURIComponent(hex)}`));
    footer.append(b);
  }
});
