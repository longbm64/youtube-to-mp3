const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const ffmpegPath = require('ffmpeg-static');

/**
 * Stream MP3 bằng yt-dlp binary local
 * @param {{ url: string, bitrate: number, res: import('express').Response }} opts
 */
const { PassThrough } = require('stream');

function streamMp3WithYtDlp({ url, bitrate, res, savePath }) {
  return new Promise((resolve, reject) => {
    const binPath = path.join(__dirname, '..', '..', 'bin', 'yt-dlp');
    if (!fs.existsSync(binPath)) {
      return reject(new Error('yt-dlp binary không tồn tại.'));
    }

    const args = [
      url,
      '-f', 'bestaudio/best',
      '--extract-audio',
      '--audio-format', 'mp3',
      '--postprocessor-args', `-b:a ${bitrate}k`,
      '--ffmpeg-location', ffmpegPath,
      '--extractor-args', 'youtube:player_client=default',
      '-o', '-',
      '--quiet',
      '--no-progress',
      '--no-mtime',
    ];

    const child = spawn(binPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.on('error', reject);
    child.stderr.on('data', () => {});
    child.on('close', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`yt-dlp exited with code ${code}`));
    });

    child.stdout.on('error', reject);
    const tee = new PassThrough();
    child.stdout.pipe(tee);

    // pipe to client
    res.on('close', () => { try { child.kill('SIGINT'); } catch (_) {} });
    tee.pipe(res);

    // optional save to file concurrently
    let fileStream;
    if (savePath) {
      try {
        fs.mkdirSync(path.dirname(savePath), { recursive: true });
        fileStream = fs.createWriteStream(savePath);
        tee.pipe(fileStream);
      } catch (e) {
        // ignore save errors, but reject if necessary
      }
    }

    child.on('close', (code) => {
      if (fileStream) { try { fileStream.end(); } catch (_) {} }
      if (code === 0) {
        if (savePath) {
          try {
            const st = fs.statSync(savePath);
            if (!st || st.size <= 0) return reject(new Error('File output rỗng'));
          } catch (e) { return reject(new Error('Không tìm thấy file output')); }
        }
        resolve();
      } else {
        reject(new Error(`yt-dlp exited with code ${code}`));
      }
    });
  });
}

module.exports = {
  streamMp3WithYtDlp,
  downloadMp3FileWithYtDlp: function ({ url, bitrate, outputPath }) {
    return new Promise((resolve, reject) => {
      const binPath = path.join(__dirname, '..', '..', 'bin', 'yt-dlp');
      if (!fs.existsSync(binPath)) {
        return reject(new Error('yt-dlp binary không tồn tại.'));
      }
      const args = [
        url,
        '-f', 'bestaudio/best',
        '--extract-audio',
        '--audio-format', 'mp3',
        '--postprocessor-args', `-b:a ${bitrate}k`,
        '--ffmpeg-location', ffmpegPath,
        '--extractor-args', 'youtube:player_client=default',
        '-o', outputPath,
        '--no-mtime',
        '--quiet',
        '--no-progress',
      ];
      const child = spawn(binPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
      child.on('error', reject);
      child.stderr.on('data', () => {});
      child.on('close', (code) => {
        if (code === 0) {
          try {
            const st = fs.statSync(outputPath);
            if (st.size > 0) return resolve();
            return reject(new Error('File output rỗng'));
          } catch (e) {
            return reject(new Error('Không tìm thấy file output'));
          }
        } else {
          reject(new Error(`yt-dlp exited with code ${code}`));
        }
      });
    });
  },
  searchYouTube: function ({ query, limit = 20 }) {
    return new Promise((resolve, reject) => {
      const binPath = path.join(__dirname, '..', '..', 'bin', 'yt-dlp');
      if (!fs.existsSync(binPath)) return reject(new Error('yt-dlp binary không tồn tại.'));
      const term = `ytsearch${Math.max(1, Math.min(50, Number(limit) || 20))}:${query}`;
      const args = ['-J', term];
      const child = spawn(binPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      let err = '';
      child.stdout.on('data', (c) => { out += c.toString(); });
      child.stderr.on('data', (c) => { err += c.toString(); });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code !== 0) return reject(new Error(err || `yt-dlp exited with code ${code}`));
        try {
          const json = JSON.parse(out || '{}');
          const entries = Array.isArray(json.entries) ? json.entries : [];
          const results = entries.map((e) => ({
            id: e.id,
            title: e.title,
            url: e.url || e.webpage_url || (e.id ? `https://www.youtube.com/watch?v=${e.id}` : ''),
            duration: e.duration,
            channel: e.channel,
            thumbnails: e.thumbnails || [],
          }));
          resolve(results);
        } catch (e) {
          reject(e);
        }
      });
    });
  },
  saveWithProgressSSE: function ({ url, bitrate, outputPath, res }) {
    return new Promise((resolve, reject) => {
      const binPath = path.join(__dirname, '..', '..', 'bin', 'yt-dlp');
      if (!fs.existsSync(binPath)) {
        return reject(new Error('yt-dlp binary không tồn tại.'));
      }
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      const args = [
        url,
        '-f', 'bestaudio/best',
        '--extract-audio',
        '--audio-format', 'mp3',
        '--postprocessor-args', `-b:a ${bitrate}k`,
        '--ffmpeg-location', ffmpegPath,
        '--extractor-args', 'youtube:player_client=default',
        '--newline',
        '-o', outputPath,
        '--no-mtime',
      ];
      const child = spawn(binPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      try { res.write(`event: status\ndata: ${JSON.stringify({ state: 'preparing' })}\n\n`); } catch (_) {}
      child.on('error', (e) => {
        try { res.write(`event: error\ndata: ${JSON.stringify({ message: e.message })}\n\n`); } catch (_) {}
        reject(e);
      });
      let bufErr = '';
      let bufOut = '';
      let phase = 'preparing';
      let downloadStarted = false;
      let downloadComplete = false;
      let processingEmitted = false;
      const parseLines = (text) => {
        const lines = text.split(/\r?\n|\r/);
        for (const line of lines) {
          const m = line.match(/\[download\]\s+(\d+(?:\.\d+)?)% of\s+([^\s]+)\s+at\s+([^\s]+)\s+ETA\s+([^\s]+)/);
          if (m) {
            const percent = Number(m[1]);
            const data = { percent, total: m[2], speed: m[3], eta: m[4] };
            try { res.write(`event: progress\ndata: ${JSON.stringify(data)}\n\n`); } catch (_) {}
            downloadStarted = true;
            if (percent < 100) {
              if (phase !== 'downloading') {
                phase = 'downloading';
                try { res.write(`event: status\ndata: ${JSON.stringify({ state: 'downloading' })}\n\n`); } catch (_) {}
              }
            } else {
              downloadComplete = true;
            }
          }
          if (/ExtractAudio|ffmpeg|Post-process|Destination:/i.test(line)) {
            if (downloadComplete && !processingEmitted) {
              processingEmitted = true;
              phase = 'processing';
              try { res.write(`event: status\ndata: ${JSON.stringify({ state: 'processing' })}\n\n`); } catch (_) {}
            }
          }
        }
      };
      child.stderr.on('data', (chunk) => {
        bufErr += chunk.toString();
        const parts = bufErr.split(/\r?\n|\r/);
        bufErr = parts.pop() || '';
        parseLines(parts.join('\n'));
      });
      child.stdout.on('data', (chunk) => {
        bufOut += chunk.toString();
        const parts = bufOut.split(/\r?\n|\r/);
        bufOut = parts.pop() || '';
        parseLines(parts.join('\n'));
      });
      child.on('close', (code) => {
        if (code === 0) {
          try {
            const st = fs.statSync(outputPath);
            if (st.size > 0) {
              const fileUrl = `/files/${path.basename(outputPath)}`;
              try { res.write(`event: status\ndata: ${JSON.stringify({ state: 'done' })}\n\n`); } catch (_) {}
              try { res.write(`event: done\ndata: ${JSON.stringify({ fileUrl })}\n\n`); } catch (_) {}
              try { res.end(); } catch (_) {}
              return resolve();
            }
            try { res.write(`event: error\ndata: ${JSON.stringify({ message: 'File output rỗng' })}\n\n`); res.end(); } catch (_) {}
            return reject(new Error('File output rỗng'));
          } catch (e) {
            try { res.write(`event: error\ndata: ${JSON.stringify({ message: 'Không tìm thấy file output' })}\n\n`); res.end(); } catch (_) {}
            return reject(new Error('Không tìm thấy file output'));
          }
        } else {
          try { res.write(`event: error\ndata: ${JSON.stringify({ message: 'convert failed' })}\n\n`); res.end(); } catch (_) {}
          reject(new Error(`yt-dlp exited with code ${code}`));
        }
      });
    });
  },
  getSafeTitle: function (url) {
    return new Promise((resolve) => {
      const binPath = path.join(__dirname, '..', '..', 'bin', 'yt-dlp');
      if (!fs.existsSync(binPath)) {
        return resolve('youtube-audio');
      }
      const child = spawn(binPath, ['-e', url], { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      child.stdout.on('data', (c) => { out += c.toString(); });
      child.on('close', () => {
        const raw = (out || '').trim();
        const safe = (raw || 'youtube-audio')
          .replace(/[\/:*?"<>|]/g, '-')
          .replace(/[\x00-\x1F\x7F]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 120) || 'youtube-audio';
        resolve(safe);
      });
      child.on('error', () => resolve('youtube-audio'));
    });
  },
};
