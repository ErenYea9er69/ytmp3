const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let FFMPEG_PATH = null;
try {
    if (fs.existsSync('/usr/bin/ffmpeg')) {
        FFMPEG_PATH = '/usr/bin/ffmpeg';
    } else {
        FFMPEG_PATH = require('@ffmpeg-installer/ffmpeg').path;
    }
} catch (e) {
    FFMPEG_PATH = 'ffmpeg';
}

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// In-memory progress tracking for real-time percentage updates
const activeJobs = {};

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
        version: '2.1.0',
        engine: 'yt-dlp + ffmpeg (Local 100% Self-Contained)',
        ffmpeg: !!FFMPEG_PATH
    });
});

// Progress polling endpoint
app.get('/progress', (req, res) => {
    const jobId = req.query.id;
    if (!jobId || !activeJobs[jobId]) {
        return res.json({ percent: 0, stage: 'waiting', completed: false });
    }
    res.json(activeJobs[jobId]);
});

// Download and convert endpoint
app.get('/download', (req, res) => {
    const videoUrl = req.query.url;
    const quality = req.query.quality || '320';
    const format = (req.query.format || 'mp3').toLowerCase();
    let title = req.query.title || 'audio';
    const jobId = req.query.jobId || (Date.now() + '_' + Math.random().toString(36).substring(2, 7));

    if (!videoUrl) {
        return res.status(400).json({ error: 'Video URL is required.' });
    }

    const safeTitle = sanitizeFilename(title);
    const outputPattern = path.join(TEMP_DIR, `${jobId}.%(ext)s`);

    // Initialize job progress
    activeJobs[jobId] = {
        percent: 1,
        stage: 'Starting download...',
        completed: false
    };

    console.log(`[YT to MP3 Local] Job ${jobId}: "${safeTitle}" (${quality}kbps ${format.toUpperCase()})`);

    let args = [];

    if (format === 'mp3') {
        args = [
            '-m', 'yt_dlp',
            '--ffmpeg-location', FFMPEG_PATH,
            '-x',
            '--audio-format', 'mp3',
            '--audio-quality', `${quality}k`,
            '--no-playlist',
            '--newline', // Forces percentage to output on new lines for easy parsing
            '-o', outputPattern,
            videoUrl
        ];
    } else {
        args = [
            '-m', 'yt_dlp',
            '--ffmpeg-location', FFMPEG_PATH,
            '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            '--no-playlist',
            '--newline',
            '-o', outputPattern,
            videoUrl
        ];
    }

    const startTime = Date.now();
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const proc = spawn(pythonCmd, args);

    // Track percentage progress from stdout
    proc.stdout.on('data', (data) => {
        const text = data.toString();
        const percentMatch = text.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
        if (percentMatch) {
            const rawPercent = parseFloat(percentMatch[1]);
            // Map download 0-100% to 1-85% of total job
            const mappedPercent = Math.min(88, Math.max(1, Math.round(rawPercent * 0.88)));
            activeJobs[jobId] = {
                percent: mappedPercent,
                stage: `Downloading stream ${Math.round(rawPercent)}%...`,
                completed: false
            };
        } else if (text.includes('[ExtractAudio]')) {
            activeJobs[jobId] = {
                percent: 92,
                stage: 'Transcoding to 320kbps MP3...',
                completed: false
            };
        }
    });

    let errorOutput = '';
    proc.stderr.on('data', (data) => {
        errorOutput += data.toString();
    });

    proc.on('close', (code) => {
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);

        if (code !== 0) {
            console.error(`[YT to MP3 Local] Failed with code ${code}:`, errorOutput);
            if (activeJobs[jobId]) {
                activeJobs[jobId] = { percent: 0, stage: 'Error', error: true, completed: true };
            }
            if (!res.headersSent) {
                return res.status(500).json({
                    error: `Local conversion failed: ${errorOutput.split('\n')[0] || 'Unknown error'}`
                });
            }
            return;
        }

        const expectedFile = path.join(TEMP_DIR, `${jobId}.${format}`);

        if (!fs.existsSync(expectedFile)) {
            const files = fs.readdirSync(TEMP_DIR).filter(f => f.startsWith(jobId));
            if (files.length === 0) {
                console.error('[YT to MP3 Local] Output file not found.');
                if (activeJobs[jobId]) {
                    activeJobs[jobId] = { percent: 0, stage: 'Error: file not found', error: true, completed: true };
                }
                if (!res.headersSent) {
                    return res.status(500).json({ error: 'Converted file could not be located.' });
                }
                return;
            }
        }

        const finalFile = fs.existsSync(expectedFile)
            ? expectedFile
            : path.join(TEMP_DIR, fs.readdirSync(TEMP_DIR).find(f => f.startsWith(jobId)));

        const finalExt = path.extname(finalFile).substring(1);
        const mimeType = finalExt === 'mp3' ? 'audio/mpeg' : 'video/mp4';

        // Mark 100% complete
        activeJobs[jobId] = {
            percent: 100,
            stage: 'Download ready!',
            completed: true
        };

        console.log(`[YT to MP3 Local] Job ${jobId} finished in ${duration}s! Streaming "${safeTitle}.${finalExt}"...`);

        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeTitle)}.${finalExt}"`);
        res.setHeader('Content-Length', fs.statSync(finalFile).size);

        const fileStream = fs.createReadStream(finalFile);
        fileStream.pipe(res);

        fileStream.on('close', () => {
            try {
                if (fs.existsSync(finalFile)) {
                    fs.unlinkSync(finalFile);
                    console.log(`[YT to MP3 Local] Cleaned temp file: ${path.basename(finalFile)}`);
                }
                // Clean up job progress after 30 seconds
                setTimeout(() => {
                    delete activeJobs[jobId];
                }, 30000);
            } catch (err) {
                console.warn('Temp file cleanup error:', err.message);
            }
        });
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log('===============================================================');
    console.log('  🎵 YT to MP3 - Cloud & Local Conversion Server               ');
    console.log(`  🚀 Status: Listening on port ${PORT}                         `);
    console.log('  ⚡ Zero External APIs · Real-Time Progress Tracker Active    ');
    console.log('===============================================================');
});
