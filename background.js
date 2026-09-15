// YouTube to MP3 Extension - Background Service Worker

const LOCAL_SERVER_URL = 'http://localhost:4000';

function sanitizeFilename(name) {
    if (!name) return 'youtube-audio';
    return name
        .replace(/[/\\?%*:|"<>]/g, '_')
        .replace(/\s+/g, ' ')
        .trim();
}

// Check local companion server
async function isLocalServerAlive() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500);
        const res = await fetch(`${LOCAL_SERVER_URL}/health`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
            const data = await res.json();
            return data.status === 'ok';
        }
    } catch (e) {
        // Server offline
    }
    return false;
}

// Save item to history
async function addToHistory(item) {
    try {
        const stored = await chrome.storage.local.get(['downloadHistory']);
        const history = stored.downloadHistory || [];
        history.unshift({
            id: Date.now(),
            title: item.title,
            videoId: item.videoId,
            quality: item.quality,
            format: item.format,
            timestamp: new Date().toISOString()
        });
        if (history.length > 30) history.pop();
        await chrome.storage.local.set({ downloadHistory: history });
    } catch (e) {
        console.error('Failed to save download history:', e);
    }
}

// Main download handler
async function handleDownload(data, sendResponse) {
    const { videoId, videoUrl, title, quality, format } = data;
    const safeTitle = sanitizeFilename(title);
    const targetFilename = `${safeTitle}.${format}`;

    console.log(`[YT to MP3] Processing download: "${safeTitle}" (${quality}kbps ${format})...`);

    try {
        // 1. Check if Local 100% Self-Contained Server is running
        const localActive = await isLocalServerAlive();
        if (localActive) {
            console.log('[YT to MP3] Downloading via Local Self-Contained Engine (Zero External APIs)...');
            const downloadUrl = `${LOCAL_SERVER_URL}/download?url=${encodeURIComponent(videoUrl)}&quality=${quality}&format=${format}&title=${encodeURIComponent(safeTitle)}`;

            chrome.downloads.download({
                url: downloadUrl,
                filename: targetFilename,
                saveAs: false
            }, (downloadId) => {
                if (chrome.runtime.lastError) {
                    console.error('[YT to MP3] Download error:', chrome.runtime.lastError);
                    sendResponse({ success: false, error: chrome.runtime.lastError.message });
                } else {
                    addToHistory({ title: safeTitle, videoId, quality, format });
                    sendResponse({ success: true, source: 'local', downloadId });
                }
            });
            return;
        }

        // 2. If Local Server is offline, do NOT use broken hanging services!
        // Return clear status so content.js can prompt the user to click start-server.bat
        console.warn('[YT to MP3] Local server is not running on http://localhost:4000');
        sendResponse({
            success: false,
            serverOffline: true,
            error: 'Local conversion server is offline. Please run start-server.bat in your ytmp3 folder for 100% self-contained downloads.'
        });

    } catch (err) {
        console.error('[YT to MP3] Download error:', err);
        sendResponse({ success: false, error: err.message || 'Conversion failed.' });
    }
}

// Runtime message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'START_DOWNLOAD') {
        handleDownload(message.data, sendResponse);
        return true;
    }

    if (message.action === 'CHECK_SERVER_HEALTH') {
        isLocalServerAlive().then(isAlive => {
            sendResponse({ isAlive });
        });
        return true;
    }

    if (message.action === 'GET_HISTORY') {
        chrome.storage.local.get(['downloadHistory'], (res) => {
            sendResponse({ history: res.downloadHistory || [] });
        });
        return true;
    }

    if (message.action === 'CLEAR_HISTORY') {
        chrome.storage.local.set({ downloadHistory: [] }, () => {
            sendResponse({ success: true });
        });
        return true;
    }
});
