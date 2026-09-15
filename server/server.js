const express = require('express');
const cors = require('cors');
const ytdl = require('@distube/ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

function sanitizeFilename(name) {
    if (!name) return 'audio';
    return name
        .replace(/[/\\?%*:|"<>]/g, '_')
        .replace(/\s+/g, ' ')
        .trim();
}

// Health check endpoint used by the extension
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        version: '1.0.0',
        mode: 'local-server',
        ffmpeg: !!ffmpegPath
    });
});

// Video info endpoint
app.get('/info', async (req, res) => {
    const videoUrl = req.query.url;
    if (!videoUrl || !ytdl.validateURL(videoUrl)) {
        return res.status(400).json({ error: 'Valid YouTube URL required.' });
    }

    try {
        const info = await ytdl.getInfo(videoUrl);
        res.json({
            title: info.videoDetails.title,
            author: info.videoDetails.author.name,
            duration: info.videoDetails.lengthSeconds,
            thumbnail: info.videoDetails.thumbnails.pop()?.url
        });
    } catch (err) {
        console.error('Error fetching info:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Download and stream endpoint
app.get('/download', async (req, res) => {
    const videoUrl = req.query.url;
    const quality = req.query.quality || '320';
    const format = (req.query.format || 'mp3').toLowerCase();
    let title = req.query.title;

    if (!videoUrl || !ytdl.validateURL(videoUrl)) {
        return res.status(400).json({ error: 'Valid YouTube URL required.' });
    }

    try {
        if (!title) {
            const info = await ytdl.getBasicInfo(videoUrl);
            title = info.videoDetails.title;
        }

        const safeTitle = sanitizeFilename(title);

        console.log(`[Local Server] Converting: "${safeTitle}" (${quality}kbps ${format.toUpperCase()})`);

        if (format === 'mp3') {
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeTitle)}.mp3"`);

            const audioStream = ytdl(videoUrl, {
                quality: 'highestaudio',
                filter: 'audioonly',
                highWaterMark: 1 << 25
            });

            audioStream.on('error', (err) => {
                console.error('ytdl stream error:', err.message);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Audio stream failed: ' + err.message });
                }
            });

            ffmpeg(audioStream)
                .audioCodec('libmp3lame')
                .audioBitrate(parseInt(quality) || 320)
                .format('mp3')
                .on('error', (err) => {
                    console.error('FFmpeg transcoding error:', err.message);
                    if (!res.headersSent) {
                        res.status(500).json({ error: 'Transcoding failed: ' + err.message });
                    }
                })
                .on('end', () => {
                    console.log(`[Local Server] Completed: "${safeTitle}.mp3"`);
                })
                .pipe(res, { end: true });

        } else if (format === 'mp4') {
            res.setHeader('Content-Type', 'video/mp4');
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeTitle)}.mp4"`);

            const videoStream = ytdl(videoUrl, {
                quality: 'highest',
                filter: 'audioandvideo'
            });

            videoStream.on('error', (err) => {
                console.error('ytdl video error:', err.message);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Video stream failed: ' + err.message });
                }
            });

            videoStream.pipe(res);
        } else {
            res.status(400).json({ error: 'Unsupported format. Use mp3 or mp4.' });
        }

    } catch (err) {
        console.error('Download error:', err.message);
        if (!res.headersSent) {
            res.status(500).json({ error: err.message });
        }
    }
});

app.listen(PORT, () => {
    console.log('====================================================');
    console.log('  🎵 YT to MP3 - Local High-Speed Companion Server  ');
    console.log(`  🚀 Status: Active on http://localhost:${PORT}        `);
    console.log('  ⚡ 320kbps MP3 Direct Extraction: Ready          ');
    console.log('====================================================');
});
