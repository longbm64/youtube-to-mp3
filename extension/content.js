function getCurrentVideoUrl() {
  try {
    const u = new URL(location.href);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      if (u.pathname.startsWith('/watch')) {
        const vid = u.searchParams.get('v');
        if (vid) return `https://www.youtube.com/watch?v=${vid}`;
        return location.href;
      }
      if (u.pathname.startsWith('/shorts/')) {
        const id = u.pathname.split('/')[2];
        if (id) return `https://www.youtube.com/watch?v=${id}`;
        return location.href;
      }
    }
    if (host === 'youtu.be') {
      const id = u.pathname.split('/').filter(Boolean)[0];
      if (id) return `https://www.youtube.com/watch?v=${id}`;
    }
    return location.href;
  } catch (_) { return location.href; }
}

function getCurrentTitle() {
  const c1 = document.querySelector('meta[name="title"]')?.content;
  const c2 = document.querySelector('meta[property="og:title"]')?.content;
  const c3 = (window.ytInitialPlayerResponse && window.ytInitialPlayerResponse.videoDetails && window.ytInitialPlayerResponse.videoDetails.title) || '';
  const c4 = document.querySelector('ytd-watch-metadata h1')?.textContent;
  const c5 = document.querySelector('#title h1')?.textContent;
  const c6 = document.querySelector('yt-formatted-string.ytd-watch-metadata')?.textContent;
  const raw = c1 || c2 || c3 || c4 || c5 || c6 || document.title || '';
  return (raw || '').replace(/ - YouTube$/i, '').trim();
}

function createButton() {
  if (document.getElementById('ytmp3-add-btn')) return;
  const btn = document.createElement('button');
  btn.id = 'ytmp3-add-btn';
  btn.textContent = 'Thêm vào YouTube → MP3';
  btn.style.position = 'fixed';
  btn.style.right = '16px';
  btn.style.bottom = '16px';
  btn.style.zIndex = '2147483647';
  btn.style.padding = '8px 12px';
  btn.style.borderRadius = '8px';
  btn.style.background = '#2563eb';
  btn.style.color = '#fff';
  btn.style.fontSize = '14px';
  btn.style.boxShadow = '0 2px 6px rgba(0,0,0,0.2)';
  btn.style.cursor = 'pointer';
  document.body.appendChild(btn);

  const refresh = () => {
    btn.dataset.url = getCurrentVideoUrl();
    btn.dataset.title = getCurrentTitle();
  };
  refresh();
  window.addEventListener('yt-navigate-finish', refresh, true);
  window.addEventListener('yt-page-data-updated', refresh, true);
  window.addEventListener('popstate', refresh, true);
  document.addEventListener('visibilitychange', refresh, true);
  // remove polling to avoid stale values; rely on SPA events

  btn.addEventListener('click', () => {
    const url = btn.dataset.url || getCurrentVideoUrl();
    let title = btn.dataset.title || getCurrentTitle();
    btn.disabled = true;
    btn.textContent = 'Đang gửi...';
    const doSend = (finalTitle) => {
      chrome.runtime.sendMessage({ type: 'addLink', url, title: finalTitle, bitrate: 128 }, (res) => {
        if (chrome.runtime.lastError) {
          btn.textContent = `Lỗi: ${chrome.runtime.lastError.message || 'kênh'}`;
          setTimeout(() => { btn.textContent = 'Thêm vào YouTube → MP3'; btn.disabled = false; }, 1500);
          return;
        }
        if (res && res.ok && res.status === 'already') {
          btn.textContent = 'Đã gửi trước đó';
        } else if (res && res.ok && res.status === 'added') {
          btn.textContent = 'Đã gửi link';
        } else {
          btn.textContent = res && res.error ? `Lỗi: ${res.error}` : 'Lỗi 2';
        }
        setTimeout(() => { btn.textContent = 'Thêm vào YouTube → MP3'; btn.disabled = false; }, 1500);
      });
    };
    if (!title || title.length < 3) {
      fetch(`http://localhost:3001/api/extension/title?url=${encodeURIComponent(url)}`)
        .then(r => r.json())
        .then(d => { doSend((d && d.title) ? d.title : title || ''); })
        .catch(() => { doSend(title || ''); });
    } else {
      doSend(title);
    }
  });
}

const obs = new MutationObserver(() => {
  createButton();
});
createButton();
obs.observe(document.documentElement, { childList: true, subtree: true });
