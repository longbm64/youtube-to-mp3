const ytdl = require('@distube/ytdl-core');

/**
 * Kiểm tra URL có thuộc YouTube/youtu.be hay không
 * @param {string} url
 * @returns {boolean}
 */
function validateYoutubeUrl(url) {
    try {
        const u = new URL(url);
        const host = u.hostname.replace('www.', '');
        return host === 'youtube.com' || host === 'youtu.be' || host.endsWith('.youtube.com');
    } catch (_) {
        return false;
    }
}

/**
 * Lấy tiêu đề video an toàn để đặt tên file
 * @param {string} url
 * @returns {Promise<string>} safeTitle
 */
async function getTitleSafe(url) {
    try {
        const info = await ytdl.getInfo(url);
        const title = info.videoDetails?.title || 'youtube-audio';
        return (
            title
                .toLowerCase()
                .replace(/[^a-z0-9\s\-_.]/g, '')
                .replace(/\s+/g, '-')
                .slice(0, 60) || 'youtube-audio'
        );
    } catch (_) {
        return 'youtube-audio';
    }
}

module.exports = {
    validateYoutubeUrl,
    getTitleSafe,
};
