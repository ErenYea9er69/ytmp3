// YouTube to MP3 Extension - Background Service Worker

const LOCAL_SERVER_URL = 'http://localhost:4000';

const COBALT_INSTANCES = [
    'https://api.cobalt.tools',
    'https://cobalt.api.sc-0.cloud',
    'https://co.wuk.sh'
];

function sanitizeFilename(name) {
    if (!name) return 'audio';
    return name
        .replace(/[/\\?%*:|"<>]/g, '_')
        .replace(/\s+/g, ' ')
        .trim();
}

// Check local companion server
async function isLocalServerAlive() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1200);
        const res = await fetch(`${LOCAL_SERVER_URL}/health`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
            const data = await res.json();
            return data.status === 'ok';
        }
    } catch (e) {
        // Local server not running
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
        // Keep last 30 items
        if (history.length > 30) history.pop();
        await chrome.storage.local.set({ downloadHistory: history });
    } catch (e) {
        console.error('Failed to save download history:', e);
    }
}

// Try downloading via Cobalt instance
async function tryCobaltDownload(videoUrl, quality, format) {
    const isAudio = format === 'mp3';

    for (const instance of COBALT_INSTANCES) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 9000);

            const payload = {
                url: videoUrl,
                downloadMode: isAudio ? 'audio' : 'auto',
                audioFormat: isAudio ? 'mp3' : undefined,
                audioBitrate: quality || '320'
            };

            const response = await fetch(`${instance}/`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (response.ok) {
                const data = await response.json();
                if (data.url) {
                    return data.url;
                }
            }
        } catch (err) {
            console.warn(`Cobalt instance ${instance} error:`, err.message);
        }
    }
    return null;
}

// Main download handler
async function handleDownload(data, sendResponse) {
    const { videoId, videoUrl, title, quality, format } = data;
    const safeTitle = sanitizeFilename(title);
    const targetFilename = `${safeTitle}.${format}`;

    console.log(`[YT to MP3] Processing download for "${safeTitle}" (${quality}k ${format})...`);

    try {
        // 1. Check if Local Companion Server is running
        const localActive = await isLocalServerAlive();
        if (localActive) {
            console.log('[YT to MP3] Routing through Local Companion Server (320kbps High Speed)...');
            const downloadUrl = `${LOCAL_SERVER_URL}/download?url=${encodeURIComponent(videoUrl)}&quality=${quality}&format=${format}&title=${encodeURIComponent(safeTitle)}`;

            chrome.downloads.download({
                url: downloadUrl,
                filename: targetFilename,
                saveAs: false
            }, (downloadId) => {
                if (chrome.runtime.lastError) {
                    sendResponse({ success: false, error: chrome.runtime.lastError.message });
                } else {
                    addToHistory({ title: safeTitle, videoId, quality, format });
                    sendResponse({ success: true, source: 'local', downloadId });
                }
            });
            return;
        }

        // 2. Try Web Conversion Engine
        console.log('[YT to MP3] Local server offline, querying web converter engine...');
        const streamUrl = await tryCobaltDownload(videoUrl, quality, format);

        if (streamUrl) {
            chrome.downloads.download({
                url: streamUrl,
                filename: targetFilename,
                saveAs: false
            }, (downloadId) => {
                if (chrome.runtime.lastError) {
                    sendResponse({ success: false, error: chrome.runtime.lastError.message });
                } else {
                    addToHistory({ title: safeTitle, videoId, quality, format });
                    sendResponse({ success: true, source: 'web', downloadId });
                }
            });
            return;
        }

        // 3. Fallback: Open fast zero-ad web converter tab directly ready for this video
        console.log('[YT to MP3] Direct stream API busy, triggering instant web converter fallback...');
        const fallbackUrl = `https://loader.to/api/button/?url=${encodeURIComponent(videoUrl)}&f=${format === 'mp3' ? 'mp3' : '1080'}&color=ff0033`;
        
        chrome.tabs.create({ url: fallbackUrl, active: true }, () => {
            sendResponse({
                success: true,
                source: 'fallback',
                note: 'Opened instant converter tab.'
            });
        });

    } catch (err) {
        console.error('[YT to MP3] Download handler failed:', err);
        sendResponse({ success: false, error: err.message || 'Conversion failed.' });
    }
}

// Runtime message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'START_DOWNLOAD') {
        handleDownload(message.data, sendResponse);
        return true; // Keep channel open for async response
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
