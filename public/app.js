/**
 * Gửi yêu cầu chuyển đổi và xử lý tải file mp3
 */
async function handleSubmit(event) {
    event.preventDefault();
    const urlInput = document.getElementById('url');
    const bitrateSelect = document.getElementById('bitrate');
    const statusEl = document.getElementById('status');
    const resultEl = document.getElementById('result');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');

    const url = urlInput.value.trim();
    const bitrate = Number(bitrateSelect.value);

    statusEl.textContent = 'Đang lưu...';
    resultEl.classList.remove('hidden');
    progressBar.style.width = '0%';
    progressText.textContent = '';

    const sseUrl = `/api/convert/save/sse?url=${encodeURIComponent(url)}&bitrate=${bitrate}`;
    const es = new EventSource(sseUrl);
    es.addEventListener('status', (e) => {
        try {
            const data = JSON.parse(e.data);
            if (data.state === 'preparing') statusEl.textContent = 'Đang chuẩn bị...';
            else if (data.state === 'downloading') statusEl.textContent = 'Đang tải...';
            else if (data.state === 'processing') statusEl.textContent = 'Đang xử lý...';
            else if (data.state === 'done') statusEl.textContent = 'Hoàn tất lưu file';
        } catch (_) { }
    });
    es.addEventListener('progress', (e) => {
        try {
            const data = JSON.parse(e.data);
            progressBar.style.width = `${Math.max(0, Math.min(100, data.percent))}%`;
            progressText.textContent = `Tiến độ: ${data.percent}% | Tốc độ: ${data.speed} | ETA: ${data.eta}`;
        } catch (_) { }
    });
    es.addEventListener('done', (e) => {
        try {
            statusEl.textContent = 'Hoàn tất lưu file';
        } catch (_) { }
        es.close();
    });
    es.addEventListener('error', async (e) => {
        try {
            const data = JSON.parse(e.data);
            statusEl.textContent = data.message || 'Đã xảy ra lỗi';
        } catch (_) {
            statusEl.textContent = 'Đã xảy ra lỗi';
        }
        es.close();
        try {
            const resp = await fetch('/api/convert/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, bitrate }),
            });
            const result = await resp.json();
            if (resp.ok && result.fileUrl) {
                progressBar.style.width = '100%';
                progressText.textContent = 'Tiến độ: 100%';
                statusEl.textContent = 'Hoàn tất lưu file (fallback)';
            } else {
                statusEl.textContent = (result && result.error) ? result.error : 'Không thể lưu file';
            }
        } catch (err2) {
            statusEl.textContent = err2.message || 'Không thể lưu file';
        }
    });
}

/**
 * Khởi tạo sự kiện form
 */
function init() {
    const urlsInput = document.getElementById('urls');
    const folderInput = document.getElementById('folderName');
    async function refreshUrlsTextarea() {
        try {
            const resp = await fetch('/api/urls/list');
            const data = await resp.json();
            if (resp.ok && data && Array.isArray(data.items)) {
                urlsInput.value = data.items
                    .map(it => {
                        const u = it && it.url ? it.url : '';
                        const t = it && it.title ? it.title : '';
                        if (!u) return '';
                        return t ? `${u} <-- ${t} -->` : u;
                    })
                    .filter(Boolean)
                    .join('\n');
            }
        } catch (_) { }
    }
    try {
        const savedFolder = localStorage.getItem('ytmp3_folderName');
        if (folderInput && savedFolder) folderInput.value = savedFolder;
        folderInput?.addEventListener('input', () => {
            try { localStorage.setItem('ytmp3_folderName', (folderInput.value || '').trim()); } catch (_) { }
        });
    } catch (_) { }
    const folderSelect = document.getElementById('folderSelect');
    if (folderSelect) {
        folderSelect.addEventListener('change', () => {
            const val = folderSelect.value || '';
            if (folderInput) folderInput.value = val;
            try { localStorage.setItem('ytmp3_folderName', val); } catch (_) { }
        });
    }
    refreshUrlsTextarea();
    (async () => {
        try {
            const resp = await fetch('/api/folders/list');
            const data = await resp.json();
            if (resp.ok && data && Array.isArray(data.items) && folderSelect) {
                folderSelect.innerHTML = '<option value="">(Chọn folder)</option>' +
                    data.items.map(n => `<option value="${n}">${n}</option>`).join('');
                const current = (folderInput?.value || '').trim();
                if (current && data.items.includes(current)) folderSelect.value = current;
            }
        } catch (_) { }
    })();

    const saveMultiBtn = document.getElementById('saveMultiBtn');
    saveMultiBtn.addEventListener('click', async () => {
        const urlsInput = document.getElementById('urls');
        const folderInput = document.getElementById('folderName');
        const folder = (folderInput?.value || '').trim();
        const statusEl = document.getElementById('status');
        if (!folder) {
            if (statusEl) {
                statusEl.textContent = 'Vui lòng nhập tên folder';
                statusEl.className = 'text-sm text-red-600';
            }
            return;
        }
        if (statusEl) {
            statusEl.textContent = '';
            statusEl.className = 'text-sm text-gray-600';
        }
        const bitrateSelect = document.getElementById('bitrate');
        const multiResult = document.getElementById('multiResult');
        const multiList = document.getElementById('multiList');

        const bitrate = Number(bitrateSelect.value);
        const lines = (urlsInput.value || '')
            .split(/\r?\n/)
            .map(s => s.trim())
            .filter(s => s.length > 0);

        const urls = lines
            .map(s => {
                const m = s.match(/https?:\/\/\S+/);
                return m ? m[0] : s;
            })
            .filter(s => s.length > 0);

        if (urls.length === 0) return;

        multiResult.classList.remove('hidden');
        multiList.innerHTML = '';

        for (const url of urls) {
            // Tạo container chính
            const item = document.createElement('div');
            item.className = 'rounded-lg border bg-white p-4 shadow-sm';

            // === Dòng 1: Tiêu đề file ===
            const titleLine = document.createElement('div');
            titleLine.className = 'flex-1 min-w-0'; // cho phép truncate

            const title = document.createElement('p');
            title.className = 'font-medium text-gray-900 truncate';
            title.textContent = url; // ban đầu hiển thị URL
            titleLine.appendChild(title);

            // === Dòng 2: Thông tin trạng thái & tiến độ ===
            const statusLine = document.createElement('div');
            statusLine.className = 'flex flex-wrap items-center gap-3 text-sm text-gray-600';

            const statusChip = document.createElement('span');
            statusChip.className = 'inline-flex items-center rounded-md bg-yellow-100 px-2.5 py-1 text-xs font-semibold text-yellow-800';
            statusChip.textContent = 'Đang chuẩn bị';

            const progressSpan = document.createElement('span');
            progressSpan.textContent = '0%';

            const speedSpan = document.createElement('span');
            speedSpan.textContent = '-';

            const etaSpan = document.createElement('span');
            etaSpan.textContent = '-';

            statusLine.append(statusChip, progressSpan, speedSpan, etaSpan);

            // Ghép vào item
            item.append(titleLine, statusLine);
            multiList.appendChild(item);

            // ==================== SSE xử lý ====================
            const sseUrl = `/api/convert/save/sse?url=${encodeURIComponent(url)}&bitrate=${bitrate}&folder=${encodeURIComponent(folder)}`;
            const es = new EventSource(sseUrl);
            es.addEventListener('status', (e) => {
                try {
                    const data = JSON.parse(e.data);
                    if (data.state === 'preparing') {
                        statusChip.className = 'inline-flex items-center rounded-md bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-700';
                        statusChip.textContent = 'Đang chuẩn bị';
                    } else if (data.state === 'downloading') {
                        statusChip.className = 'inline-flex items-center rounded-md bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700';
                        statusChip.textContent = 'Đang tải';
                    } else if (data.state === 'processing') {
                        statusChip.className = 'inline-flex items-center rounded-md bg-indigo-100 px-2 py-1 text-xs font-medium text-indigo-700';
                        statusChip.textContent = 'Đang xử lý';
                    } else if (data.state === 'done') {
                        statusChip.className = 'inline-flex items-center rounded-md bg-green-100 px-2 py-1 text-xs font-medium text-green-700';
                        statusChip.textContent = 'Hoàn tất';
                    }
                } catch (_) { }
            });

            es.addEventListener('progress', (e) => {
                try {
                    const data = JSON.parse(e.data);
                    const percent = Math.max(0, Math.min(100, data.percent));

                    progressSpan.textContent = `${percent}%`;
                    speedSpan.textContent = data.speed || '-';
                    etaSpan.textContent = data.eta || '-';

                    statusChip.textContent = 'Đang tải';
                    statusChip.className = 'inline-flex items-center rounded-md bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800';
                } catch (_) { }
            });

            es.addEventListener('done', (ev) => {
                es.close();
                progressSpan.textContent = '100%';
                speedSpan.textContent = '-';
                etaSpan.textContent = '-';

                statusChip.textContent = 'Hoàn tất';
                statusChip.className = 'inline-flex items-center rounded-md bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800';

                try {
                    const data = JSON.parse(ev.data);
                    if (data.fileUrl) {
                        const fileName = decodeURIComponent(data.fileUrl.split('/').pop());
                        title.textContent = fileName; // cập nhật thành tên file thật
                    }
                } catch (_) { }
                refreshUrlsTextarea();
            });

            es.addEventListener('error', async () => {
                es.close();
                statusChip.textContent = 'Lỗi';
                statusChip.className = 'inline-flex items-center rounded-md bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800';

                // Fallback đồng bộ
                try {
                    const resp = await fetch('/api/convert/save', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url, bitrate, folder }),
                    });
                    const result = await resp.json();
                    if (resp.ok && result.fileUrl) {
                        const fileName = decodeURIComponent(result.fileUrl.split('/').pop());
                        title.textContent = fileName;

                        progressSpan.textContent = '100%';
                        statusChip.textContent = 'Hoàn tất';
                        statusChip.className = 'inline-flex items-center rounded-md bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800';
                        refreshUrlsTextarea();
                    }
                } catch (_) { }
            });
        }
    });


}

document.addEventListener('DOMContentLoaded', init);
