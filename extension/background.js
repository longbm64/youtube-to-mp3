const DEFAULT_SERVER_BASE = 'http://localhost:3001';

/**
 * Đọc SERVER_BASE từ chrome.storage và trả về giá trị hợp lệ.
 * @returns {Promise<string>} - URL gốc dạng http(s)://host
 */
function getServerBase() {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get({ serverBase: DEFAULT_SERVER_BASE }, (res) => {
        const raw = (res && res.serverBase) ? String(res.serverBase) : DEFAULT_SERVER_BASE;
        let u;
        try { u = new URL(raw); } catch (_) { return resolve(DEFAULT_SERVER_BASE); }
        if (!(u.protocol === 'http:' || u.protocol === 'https:')) return resolve(DEFAULT_SERVER_BASE);
        const base = `${u.protocol}//${u.host}`.replace(/\/+$/, '');
        resolve(base || DEFAULT_SERVER_BASE);
      });
    } catch (_) { resolve(DEFAULT_SERVER_BASE); }
  });
}

function normalizeYouTubeUrl(raw) {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = u.pathname.split('/').filter(Boolean)[0];
      if (id) return `https://www.youtube.com/watch?v=${id}`;
    }
    if (host === 'youtube.com') {
      if (u.pathname.startsWith('/shorts/')) {
        const id = u.pathname.split('/')[2];
        if (id) return `https://www.youtube.com/watch?v=${id}`;
      }
    }
    return raw;
  } catch (_) { return raw; }
}

// duplicate checking is done by server

chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.create({
    id: 'add-to-mp3',
    title: 'Thêm vào YouTube → MP3',
    contexts: ['page', 'link'],
    documentUrlPatterns: ['https://www.youtube.com/*', 'https://youtube.com/*']
  });
  if (details && details.reason === 'install') {
    try { chrome.runtime.openOptionsPage(); } catch (_) { }
  }
});

chrome.action.onClicked.addListener(() => {
  try { chrome.runtime.openOptionsPage(); } catch (_) { }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'add-to-mp3') return;
  let url = info.linkUrl || info.pageUrl || (tab && tab.url) || '';
  url = normalizeYouTubeUrl(url);
  const rawTitle = (tab && tab.title) ? tab.title : '';
  const title = (rawTitle || '').replace(/ - YouTube$/i, '').trim();
  if (!url) return;
  try {
    const serverBase = await getServerBase();
    const resp = await fetch(`${serverBase}/api/extension/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, title, bitrate: 128 }),
      credentials: 'omit'
    });
    let errMsg = '';
    let status = '';
    try {
      const body = await resp.json();
      status = body && body.status || '';
      if (!resp.ok) errMsg = body && body.error ? body.error : `HTTP ${resp.status}`;
    } catch (_) { }
    if (resp.ok && status === 'already') {
      chrome.notifications?.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: 'Đã gửi trước đó',
        message: 'Link đã có trong danh sách'
      });
    } else if (resp.ok) {
      chrome.notifications?.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: 'Đã gửi link',
        message: 'Video đã được thêm để lưu MP3'
      });
    } else {
      chrome.notifications?.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: 'Lỗi gửi link',
        message: errMsg || 'Không thể gửi link'
      });
    }
  } catch (_) { }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'addLink') {
    const url = normalizeYouTubeUrl(msg.url);
    const bitrate = msg.bitrate || 128;
    const title = (msg.title || '').toString().trim();
    (async () => {
      try {
        const serverBase = await getServerBase();
        const resp = await fetch(`${serverBase}/api/extension/add`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, title, bitrate }),
          credentials: 'omit'
        });
        let ok = resp.ok;
        let errMsg = '';
        let status = '';
        try {
          const body = await resp.json();
          status = body && body.status || '';
          if (!resp.ok) errMsg = body && body.error ? body.error : `HTTP ${resp.status}`;
        } catch (_) { }
        if (!ok && errMsg) {
          chrome.notifications?.create({
            type: 'basic',
            iconUrl: 'icon.png',
            title: 'Lỗi gửi link',
            message: errMsg
          });
        }
        sendResponse({ ok, error: errMsg, status: status || (ok ? 'added' : 'error') });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message, status: 'error' });
      }
    })();
    return true;
  }
});
