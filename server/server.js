const express = require('express');
const cors = require('cors');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const FFMPEG_PATH = require('@ffmpeg-installer/ffmpeg').path;

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

function sanitizeFilename(name) {
    if (!name) return 'youtube-audio';
    return name
        .replace(/[/\\?%*:|"<>]/g, '_')
        .replace(/\s+/g, ' ')
        .trim();
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        version: '2.0.0',
        engine: 'yt-dlp + ffmpeg (Local 100% Self-Contained)',
        ffmpeg: !!FFMPEG_PATH
    });
});

// Download and convert endpoint
app.get('/download', (req, res) => {
    const videoUrl = req.query.url;
    const quality = req.query.quality || '320';
    const format = (req.query.format || 'mp3').toLowerCase();
    let title = req.query.title || 'audio';

    if (!videoUrl) {
        return res.status(400).json({ error: 'Video URL is required.' });
    }

    const safeTitle = sanitizeFilename(title);
    const downloadId = Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const outputPattern = path.join(TEMP_DIR, `${downloadId}.%(ext)s`);

    console.log(`[YT to MP3 Local] Starting local conversion: "${safeTitle}" (${quality}kbps ${format.toUpperCase()})`);

    let args = [];

    if (format === 'mp3') {
        args = [
            '-m', 'yt_dlp',
            '--ffmpeg-location', FFMPEG_PATH,
            '-x',
            '--audio-format', 'mp3',
            '--audio-quality', `${quality}k`,
            '--no-playlist',
            '--no-warnings',
            '-o', outputPattern,
            videoUrl
        ];
    } else {
        args = [
            '-m', 'yt_dlp',
            '--ffmpeg-location', FFMPEG_PATH,
            '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            '--no-playlist',
            '--no-warnings',
            '-o', outputPattern,
            videoUrl
        ];
    }

    const startTime = Date.now();
    const proc = spawn('python', args);

    let errorOutput = '';
    proc.stderr.on('data', (data) => {
        errorOutput += data.toString();
    });

    proc.on('close', (code) => {
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);

        if (code !== 0) {
            console.error(`[YT to MP3 Local] Failed with code ${code}:`, errorOutput);
            if (!res.headersSent) {
                return res.status(500).json({
                    error: `Local conversion failed: ${errorOutput.split('\n')[0] || 'Unknown error'}`
                });
            }
            return;
        }

        const expectedFile = path.join(TEMP_DIR, `${downloadId}.${format}`);

        if (!fs.existsSync(expectedFile)) {
            // Find if any file was generated with this downloadId
            const files = fs.readdirSync(TEMP_DIR).filter(f => f.startsWith(downloadId));
            if (files.length === 0) {
                console.error('[YT to MP3 Local] Output file not found.');
                if (!res.headersSent) {
                    return res.status(500).json({ error: 'Converted file could not be located.' });
                }
                return;
            }
        }

        const finalFile = fs.existsSync(expectedFile)
            ? expectedFile
            : path.join(TEMP_DIR, fs.readdirSync(TEMP_DIR).find(f => f.startsWith(downloadId)));

        const finalExt = path.extname(finalFile).substring(1);
        const mimeType = finalExt === 'mp3' ? 'audio/mpeg' : 'video/mp4';

        console.log(`[YT to MP3 Local] Done in ${duration}s! Streaming "${safeTitle}.${finalExt}"...`);

        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeTitle)}.${finalExt}"`);
        res.setHeader('Content-Length', fs.statSync(finalFile).size);

        const fileStream = fs.createReadStream(finalFile);
        fileStream.pipe(res);

        fileStream.on('close', () => {
            // Clean up temporary file after streaming completes
            try {
                if (fs.existsSync(finalFile)) {
                    fs.unlinkSync(finalFile);
                    console.log(`[YT to MP3 Local] Cleaned temp file: ${path.basename(finalFile)}`);
                }
            } catch (err) {
                console.warn('Temp file cleanup error:', err.message);
            }
        });
    });
});

app.listen(PORT, () => {
    console.log('===============================================================');
    console.log('  🎵 YT to MP3 - Local 100% Self-Contained Server              ');
    console.log(`  🚀 Status: Listening on http://localhost:${PORT}             `);
    console.log('  ⚡ Zero External APIs - Native yt-dlp & FFmpeg Transcoding   ');
    console.log('===============================================================');
});
