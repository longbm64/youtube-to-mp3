const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ytdl = require('@distube/ytdl-core');

ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * Tạo stream mp3 từ YouTube và pipe ra response
 * @param {{ url: string, bitrate: number, res: import('express').Response }} opts
 * @returns {Promise<void>}
 */
function streamMp3FromYoutube(opts) {
    const { url, bitrate, res } = opts;
    return new Promise((resolve, reject) => {
        // Tạo audio stream từ YouTube
        const audioStream = ytdl(url, {
            quality: 'highestaudio',
            filter: 'audioonly',
            highWaterMark: 1 << 25, // Tăng buffer tránh nghẽn
            requestOptions: {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
                },
            },
        });
        audioStream.on('error', (err) => {
            reject(err);
        });

        // Thiết lập pipeline ffmpeg chuyển đổi sang mp3
        const command = ffmpeg()
            .input(audioStream)
            .audioBitrate(bitrate)
            .format('mp3')
            .on('error', (err) => {
                reject(err);
            })
            .on('end', () => {
                resolve();
            });

        // Stream kết quả trực tiếp về client
        const ffmpegStream = command.pipe();
        ffmpegStream.on('error', reject);
        ffmpegStream.pipe(res);
    });
}

module.exports = {
    streamMp3FromYoutube,
};
