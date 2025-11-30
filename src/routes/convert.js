const express = require('express');
const router = express.Router();
const { validateYoutubeUrl, getTitleSafe } = require('../services/youtube');
const { streamMp3WithYtDlp, downloadMp3FileWithYtDlp, getSafeTitle } = require('../services/ytDlp');
const { searchYouTube } = require('../services/ytDlp');

/**
 * POST /api/convert
 * Body: { url: string, bitrate?: number }
 * Trả về: stream audio/mpeg (attachment)
 */
router.post('/', async (req, res) => {
    try {
        const { url, bitrate } = req.body || {};
        if (!url || !validateYoutubeUrl(url)) {
            return res.status(400).json({ error: 'URL không hợp lệ. Vui lòng nhập link YouTube.' });
        }

        const pathLib = require('path');
        const fs = require('fs');
        const filesDir = pathLib.join(__dirname, '..', '..', 'public', 'files');
        fs.mkdirSync(filesDir, { recursive: true });
        const base = await getSafeTitle(url);
        let filename = `${base}.mp3`;
        const candidate = pathLib.join(filesDir, filename);
        if (fs.existsSync(candidate)) {
            filename = `${base}-${Date.now()}.mp3`;
        }
        const savePath = pathLib.join(filesDir, filename);

        // headers
        res.setHeader('Content-Type', 'audio/mpeg');
        const encoded = encodeURIComponent(filename).replace(/\*/g, '%2A');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encoded}`);
        if (typeof res.flushHeaders === 'function') res.flushHeaders();

        // stream + save concurrently
        await streamMp3WithYtDlp({ url, bitrate: Number(bitrate) || 128, res, savePath });
    } catch (err) {
        console.error('Convert error:', err);
        if (!res.headersSent) {
            return res.status(500).json({ error: err && err.message ? err.message : 'Có lỗi xảy ra khi xử lý video.' });
        }
        // Nếu đang stream, kết thúc kết nối
        try { res.end(); } catch (_) { }
    }
});

router.post('/save', async (req, res) => {
    try {
        const { url, bitrate } = req.body || {};
        if (!url || !validateYoutubeUrl(url)) {
            return res.status(400).json({ error: 'URL không hợp lệ. Vui lòng nhập link YouTube.' });
        }

        const pathLib = require('path');
        const rawFolder = (req.body.folder || '').toString().trim();
        const safeFolder = rawFolder
            .replace(/[\\/:*?"<>|]/g, '')
            .replace(/\.{2,}/g, '')
            .replace(/[\x00-\x1F\x7F]/g, '')
            .slice(0, 100);
        const baseDir = pathLib.join(__dirname, '..', '..', 'public', 'files');
        const filesDir = safeFolder ? pathLib.join(baseDir, safeFolder) : baseDir;
        const fs = require('fs');
        fs.mkdirSync(filesDir, { recursive: true });

        const base = await getSafeTitle(url);
        let filename = `${base}.mp3`;
        const outputPathCandidate = pathLib.join(filesDir, filename);
        if (fs.existsSync(outputPathCandidate)) {
            filename = `${base}-${Date.now()}.mp3`;
        }
        const outputPath = pathLib.join(filesDir, filename);
        await downloadMp3FileWithYtDlp({ url, bitrate: Number(bitrate) || 128, outputPath });

        try {
            const fs = require('fs');
            const logFile = pathLib.join(__dirname, '..', '..', 'listUrl.txt');
            if (fs.existsSync(logFile)) {
                const content = fs.readFileSync(logFile, 'utf8');
                const lines = content.split(/\r?\n/).filter(Boolean);
                const filtered = lines.filter((line) => {
                    try { const obj = JSON.parse(line); return obj.url !== url; } catch (_) { return true; }
                });
                fs.writeFileSync(logFile, filtered.join('\n') + (filtered.length ? '\n' : ''));
            }
        } catch (_) { }

        const fileUrl = `/files/${filename}`;
        return res.json({ fileUrl });
    } catch (err) {
        console.error('Save error:', err);
        return res.status(500).json({ error: err && err.message ? err.message : 'Có lỗi xảy ra khi lưu file.' });
    }
});

router.get('/save/sse', async (req, res) => {
    try {
        const url = req.query.url;
        const bitrate = Number(req.query.bitrate) || 128;
        const rawFolder = (req.query.folder || '').toString().trim();
        const safeFolder = rawFolder
            .replace(/[\\/:*?"<>|]/g, '')
            .replace(/\.{2,}/g, '')
            .replace(/[\x00-\x1F\x7F]/g, '')
            .slice(0, 100);
        if (!url || !validateYoutubeUrl(url)) {
            res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
            res.write(`event: error\ndata: ${JSON.stringify({ message: 'URL không hợp lệ' })}\n\n`);
            return res.end();
        }
        const pathLib = require('path');
        const baseDir = pathLib.join(__dirname, '..', '..', 'public', 'files');
        const filesDir = safeFolder ? pathLib.join(baseDir, safeFolder) : baseDir;
        const fs = require('fs');
        fs.mkdirSync(filesDir, { recursive: true });
        const base = await getSafeTitle(url);
        let filename = `${base}.mp3`;
        const outputPathCandidate = pathLib.join(filesDir, filename);
        const fs2 = require('fs');
        if (fs2.existsSync(outputPathCandidate)) {
            filename = `${base}-${Date.now()}.mp3`;
        }
        const outputPath = pathLib.join(filesDir, filename);
        await require('../services/ytDlp').saveWithProgressSSE({ url, bitrate, outputPath, res });
        try {
            const fs = require('fs');
            const logFile = pathLib.join(__dirname, '..', '..', 'listUrl.txt');
            if (fs.existsSync(logFile)) {
                const content = fs.readFileSync(logFile, 'utf8');
                const lines = content.split(/\r?\n/).filter(Boolean);
                const filtered = lines.filter((line) => {
                    try { const obj = JSON.parse(line); return obj.url !== url; } catch (_) { return true; }
                });
                fs.writeFileSync(logFile, filtered.join('\n') + (filtered.length ? '\n' : ''));
            }
        } catch (_) { }
    } catch (err) {
        try {
            res.write(`event: error\ndata: ${JSON.stringify({ message: err && err.message ? err.message : 'Có lỗi xảy ra' })}\n\n`);
        } catch (_) { }
        try { res.end(); } catch (_) { }
    }
});

router.get('/search', async (req, res) => {
    try {
        const q = (req.query.q || '').toString().trim();
        const limit = Number(req.query.limit) || 20;
        if (!q) return res.status(400).json({ error: 'Thiếu từ khóa tìm kiếm' });
        const results = await searchYouTube({ query: q, limit });
        return res.json({ items: results });
    } catch (err) {
        return res.status(500).json({ error: err && err.message ? err.message : 'Không thể tìm kiếm' });
    }
});

module.exports = router;
