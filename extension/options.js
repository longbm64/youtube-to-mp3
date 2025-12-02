const DEFAULT_SERVER_BASE = 'http://localhost:3001';

function validateAndNormalizeBase(raw) {
  const s = (raw || '').trim();
  if (!s) return '';
  let u;
  try { u = new URL(s); } catch (_) { return ''; }
  if (!(u.protocol === 'http:' || u.protocol === 'https:')) return '';
  const base = `${u.protocol}//${u.host}`;
  return base.replace(/\/+$/, '');
}

function loadServerBase() {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get({ serverBase: DEFAULT_SERVER_BASE }, (res) => {
        const s = validateAndNormalizeBase(res.serverBase || '');
        resolve(s || DEFAULT_SERVER_BASE);
      });
    } catch (_) { resolve(DEFAULT_SERVER_BASE); }
  });
}

function saveServerBase(base) {
  return new Promise((resolve, reject) => {
    try { chrome.storage.sync.set({ serverBase: base }, () => resolve()); }
    catch (e) { reject(e); }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const input = document.getElementById('serverBase');
  const form = document.getElementById('serverForm');
  const msg = document.getElementById('msg');
  const resetBtn = document.getElementById('resetBtn');

  const current = await loadServerBase();
  input.value = current;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const normalized = validateAndNormalizeBase(input.value);
    if (!normalized) {
      msg.textContent = 'URL không hợp lệ. Vui lòng nhập dạng http(s)://domain';
      msg.style.color = '#dc2626';
      return;
    }
    await saveServerBase(normalized);
    msg.textContent = 'Đã lưu SERVER_BASE';
    msg.style.color = '#16a34a';
  });

  resetBtn.addEventListener('click', async () => {
    input.value = DEFAULT_SERVER_BASE;
    await saveServerBase(DEFAULT_SERVER_BASE);
    msg.textContent = 'Đã đặt về mặc định';
    msg.style.color = '#16a34a';
  });
});

