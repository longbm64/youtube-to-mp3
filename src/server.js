const express = require('express');
const path = require('path');
const convertRouter = require('./routes/convert');
const { searchYouTube, downloadMp3FileWithYtDlp, getSafeTitle } = require('./services/ytDlp');

// Khởi tạo ứng dụng Express và cấu hình static để phục vụ UI Tailwind
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});
// Phục vụ file extension.crx trước static để tránh 404 từ middleware static
app.get('/extension.crx', (req, res) => {
    try {
        const fs = require('fs');
        const filePath = path.join(__dirname, '..', 'extension.crx');
        if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
        res.setHeader('Content-Type', 'application/x-chrome-extension');
        res.setHeader('Content-Disposition', 'attachment; filename="extension.crx"');
        res.sendFile(filePath);
    } catch (_) {
        res.status(500).send('Server error');
    }
});

// Alias mới: youtube-to-mp3.crx (giữ file vật lý cũ, đổi tên file tải về)
app.get('/youtube-to-mp3.crx', (req, res) => {
    try {
        const fs = require('fs');
        const filePath = path.join(__dirname, '..', 'extension.crx');
        if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
        res.setHeader('Content-Type', 'application/x-chrome-extension');
        res.setHeader('Content-Disposition', 'attachment; filename="youtube-to-mp3.crx"');
        res.sendFile(filePath);
    } catch (_) {
        res.status(500).send('Server error');
    }
});

// Phục vụ bản ZIP để tải về
app.get('/youtube-to-mp3.zip', (req, res) => {
    try {
        const fs = require('fs');
        const filePath = path.join(__dirname, '..', 'youtube-to-mp3.zip');
        if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', 'attachment; filename="youtube-to-mp3.zip"');
        res.sendFile(filePath);
    } catch (_) {
        res.status(500).send('Server error');
    }
});

// Phục vụ zip thư mục extension
app.get('/extension.zip', (req, res) => {
    try {
        const fs = require('fs');
        const filePath = path.join(__dirname, '..', 'extension.zip');
        if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', 'attachment; filename="extension.zip"');
        res.sendFile(filePath);
    } catch (_) {
        res.status(500).send('Server error');
    }
});
app.use(express.static(path.join(__dirname, '..', 'public')));

// Đăng ký route chuyển đổi
app.use('/api/convert', convertRouter);

app.get('/api/search', async (req, res) => {
    try {
        const q = (req.query.q || '').toString().trim();
        const limit = Number(req.query.limit) || 20;
        const channel = (req.query.channel || '').toString().trim().toLowerCase();
        if (!q) return res.status(400).json({ error: 'Thiếu từ khóa tìm kiếm' });
        const items = await searchYouTube({ query: q, limit });
        const filtered = channel
            ? items.filter((it) => ((it.channel || '').toLowerCase().includes(channel)))
            : items;
        return res.json({ items: filtered });
    } catch (err) {
        return res.status(500).json({ error: err && err.message ? err.message : 'Không thể tìm kiếm' });
    }
});

// Simple in-memory queue for extension submissions
const extensionQueue = [];

// Receive data from extension and save immediately
app.post('/api/extension/add', async (req, res) => {
    try {
        const url = (req.body.url || '').toString().trim();
        const bitrate = Number(req.body.bitrate) || 128;
        if (!url) return res.status(400).json({ error: 'Thiếu url' });

        try {
            const fs = require('fs');
            const logFile = path.join(__dirname, '..', 'listUrl.txt');
            const title = (req.body.title || '').toString().trim();
            let already = false;
            if (fs.existsSync(logFile)) {
                try {
                    const content = fs.readFileSync(logFile, 'utf8');
                    const lines = content.split(/\r?\n/).filter(Boolean);
                    for (const line of lines) {
                        try {
                            const obj = JSON.parse(line);
                            if (obj && obj.url === url) { already = true; break; }
                        } catch (_) { }
                    }
                } catch (_) { }
            }
            if (already) {
                return res.json({ ok: true, status: 'already' });
            }
            const entry = JSON.stringify({ url, title, bitrate, ts: Date.now() });
            await fs.promises.appendFile(logFile, entry + '\n');
            return res.json({ ok: true, status: 'added' });
        } catch (e) {
            return res.status(500).json({ error: e && e.message ? e.message : 'Không thể ghi danh sách' });
        }
        return;
    } catch (err) {
        return res.status(500).json({ error: err && err.message ? err.message : 'Không thể xử lý yêu cầu' });
    }
});

// List recent extension submissions
app.get('/api/extension/queue', (req, res) => {
    res.json({ items: extensionQueue });
});

app.get('/api/urls/list', (req, res) => {
    try {
        const fs = require('fs');
        const logFile = path.join(__dirname, '..', 'listUrl.txt');
        if (!fs.existsSync(logFile)) return res.json({ items: [] });
        const content = fs.readFileSync(logFile, 'utf8');
        const lines = content.split(/\r?\n/).filter(Boolean);
        const items = [];
        for (const line of lines) {
            try {
                const obj = JSON.parse(line);
                items.push(obj);
            } catch (_) { }
        }
        return res.json({ items });
    } catch (err) {
        return res.status(500).json({ error: err && err.message ? err.message : 'Không thể đọc danh sách' });
    }
});

app.get('/api/folders/list', (req, res) => {
    try {
        const fs = require('fs');
        const baseDir = path.join(__dirname, '..', 'public', 'files');
        if (!fs.existsSync(baseDir)) return res.json({ items: [] });
        const entries = fs.readdirSync(baseDir, { withFileTypes: true });
        const items = entries.filter((d) => d.isDirectory()).map((d) => d.name);
        return res.json({ items });
    } catch (err) {
        return res.status(500).json({ error: err && err.message ? err.message : 'Không thể đọc danh sách thư mục' });
    }
});

app.get('/api/folders/files', (req, res) => {
    try {
        const fs = require('fs');
        const baseDir = path.join(__dirname, '..', 'public', 'files');
        const rawFolder = (req.query.folder || '').toString().trim();
        const safeFolder = rawFolder
            .replace(/[\\/:*?"<>|]/g, '')
            .replace(/\.{2,}/g, '')
            .replace(/[\x00-\x1F\x7F]/g, '')
            .slice(0, 100);
        const targetDir = safeFolder ? path.join(baseDir, safeFolder) : baseDir;
        if (!fs.existsSync(targetDir)) return res.json({ items: [] });
        const entries = fs.readdirSync(targetDir, { withFileTypes: true });
        const files = entries
            .filter((d) => d.isFile() && d.name.toLowerCase().endsWith('.mp3'))
            .map((d) => d.name);
        const items = files.map((name) => ({ name, url: `/files/${safeFolder ? safeFolder + '/' : ''}${encodeURIComponent(name)}` }));
        return res.json({ items });
    } catch (err) {
        return res.status(500).json({ error: err && err.message ? err.message : 'Không thể đọc danh sách file' });
    }
});

app.get('/api/extension/title', async (req, res) => {
    try {
        const url = (req.query.url || '').toString().trim();
        if (!url) return res.status(400).json({ error: 'Thiếu url' });
        const title = await getSafeTitle(url);
        return res.json({ title });
    } catch (err) {
        return res.status(500).json({ error: err && err.message ? err.message : 'Không thể lấy tiêu đề' });
    }
});

// Trang chủ: phục vụ file index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.get('/files', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'files.html'));
});


// Khởi động server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});
