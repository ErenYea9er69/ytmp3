const LOCAL_SERVER_URL = 'http://localhost:4000';

// Automatically inject content scripts into open YouTube tabs on install / reload
function injectIntoExistingTabs() {
    chrome.tabs.query({ url: "*://*.youtube.com/*" }, (tabs) => {
        for (const tab of tabs) {
            if (tab.id) {
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ["content/content.js"]
                }).catch(() => {});
                chrome.scripting.insertCSS({
                    target: { tabId: tab.id },
                    files: ["content/content.css"]
                }).catch(() => {});
            }
        }
    });
}

chrome.runtime.onInstalled.addListener(injectIntoExistingTabs);
injectIntoExistingTabs();

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('youtube.com/watch')) {
        chrome.scripting.executeScript({
            target: { tabId },
            files: ["content/content.js"]
        }).catch(() => {});
        chrome.scripting.insertCSS({
            target: { tabId },
            files: ["content/content.css"]
        }).catch(() => {});
    }
});

function sanitizeFilename(name) {
    if (!name) return 'youtube-audio';
    return name
        .replace(/[/\\?%*:|"<>]/g, '_')
        .replace(/\s+/g, ' ')
        .trim();
}

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

async function handleDownload(data, sendResponse) {
    const { videoId, videoUrl, title, quality, format, jobId } = data;
    const safeTitle = sanitizeFilename(title);
    const targetFilename = `${safeTitle}.${format}`;

    console.log(`[YT to MP3] Job ${jobId}: "${safeTitle}" (${quality}kbps ${format})...`);

    try {
        const localActive = await isLocalServerAlive();
        if (localActive) {
            const downloadUrl = `${LOCAL_SERVER_URL}/download?url=${encodeURIComponent(videoUrl)}&quality=${quality}&format=${format}&title=${encodeURIComponent(safeTitle)}&jobId=${encodeURIComponent(jobId)}`;

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
                    sendResponse({ success: true, source: 'local', downloadId, jobId });
                }
            });
            return;
        }

        sendResponse({
            success: false,
            serverOffline: true,
            error: 'Local conversion server is offline. Please run start-server.bat in your ytmp3 folder.'
        });

    } catch (err) {
        console.error('[YT to MP3] Download error:', err);
        sendResponse({ success: false, error: err.message || 'Conversion failed.' });
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'START_DOWNLOAD') {
        handleDownload(message.data, sendResponse);
        return true;
    }

    if (message.action === 'CHECK_PROGRESS') {
        const jobId = message.jobId;
        fetch(`${LOCAL_SERVER_URL}/progress?id=${encodeURIComponent(jobId)}`)
            .then(res => res.json())
            .then(data => sendResponse({ success: true, data }))
            .catch(err => sendResponse({ success: false, error: err.message }));
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
