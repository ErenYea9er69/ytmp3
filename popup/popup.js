// YouTube to MP3 Extension - Popup Logic

document.addEventListener('DOMContentLoaded', () => {
    const statusDot = document.getElementById('status-dot');
    const statusLabel = document.getElementById('status-label');
    const statusDesc = document.getElementById('status-desc');
    const qualitySelect = document.getElementById('quality-select');
    const btnRefreshStatus = document.getElementById('btn-refresh-status');
    const currentVideoCard = document.getElementById('current-video-card');
    const currentVideoTitle = document.getElementById('current-video-title');
    const currentVideoChannel = document.getElementById('current-video-channel');
    const btnConvertCurrent = document.getElementById('btn-convert-current');
    const toggleCompanionInfo = document.getElementById('toggle-companion-info');
    const companionInfoBody = document.getElementById('companion-info-body');
    const infoCard = document.querySelector('.info-card');
    const historyList = document.getElementById('history-list');
    const btnClearHistory = document.getElementById('btn-clear-history');

    const cloudUrlInput = document.getElementById('cloud-url-input');
    const btnSaveCloudUrl = document.getElementById('btn-save-cloud-url');
    const cloudUrlStatus = document.getElementById('cloud-url-status');

    let activeTabInfo = null;

    // Check Companion / Cloud Server Status
    function checkStatus() {
        statusDot.className = 'status-dot pulse';
        statusLabel.textContent = 'Checking Engine...';
        statusDesc.textContent = 'Probing cloud and local servers...';

        chrome.runtime.sendMessage({ action: 'CHECK_SERVER_HEALTH' }, (response) => {
            if (response && response.isAlive) {
                statusDot.className = 'status-dot active-local';
                if (response.mode === 'cloud') {
                    statusLabel.textContent = 'Cloud Engine: Online 🟢';
                    statusDesc.textContent = response.url.replace(/^https?:\/\//, '');
                    if (cloudUrlStatus) cloudUrlStatus.textContent = 'Connected ✅';
                } else {
                    statusLabel.textContent = 'Local Engine: Online 🟢';
                    statusDesc.textContent = 'localhost:4000 (320kbps Direct)';
                }
            } else {
                statusDot.className = 'status-dot';
                statusLabel.textContent = 'Engine: Offline ⚠️';
                if (response && response.hasCloudConfigured) {
                    statusDesc.textContent = 'Cloud waking up... wait 30s or check URL';
                    if (cloudUrlStatus) cloudUrlStatus.textContent = 'Unreachable';
                } else {
                    statusDesc.textContent = 'Start local server or enter Cloud URL below';
                    if (cloudUrlStatus) cloudUrlStatus.textContent = 'Optional';
                }
            }
        });
    }

    // Load saved cloud URL
    chrome.storage.local.get(['cloudServerUrl'], (res) => {
        if (res && res.cloudServerUrl && cloudUrlInput) {
            cloudUrlInput.value = res.cloudServerUrl;
        }
    });

    // Save cloud URL
    if (btnSaveCloudUrl) {
        btnSaveCloudUrl.addEventListener('click', () => {
            const val = (cloudUrlInput.value || '').trim();
            chrome.storage.local.set({ cloudServerUrl: val }, () => {
                btnSaveCloudUrl.textContent = 'Saved!';
                setTimeout(() => { btnSaveCloudUrl.textContent = 'Save'; }, 1500);
                checkStatus();
            });
        });
    }

    // Load saved settings
    chrome.storage.local.get(['preferredQuality'], (res) => {
        if (res && res.preferredQuality) {
            qualitySelect.value = res.preferredQuality;
        } else {
            qualitySelect.value = '320';
        }
    });

    // Save quality setting change
    qualitySelect.addEventListener('change', () => {
        chrome.storage.local.set({ preferredQuality: qualitySelect.value });
    });

    // Refresh button
    btnRefreshStatus.addEventListener('click', checkStatus);

    // Toggle companion info accordion
    toggleCompanionInfo.addEventListener('click', () => {
        infoCard.classList.toggle('open');
        const isHidden = companionInfoBody.style.display === 'none';
        companionInfoBody.style.display = isHidden ? 'block' : 'none';
    });

    // Detect active tab video
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0] && tabs[0].url) {
            const url = tabs[0].url;
            if (url.includes('youtube.com/watch')) {
                const urlParams = new URLSearchParams(new URL(url).search);
                const videoId = urlParams.get('v');

                if (videoId) {
                    activeTabInfo = {
                        videoId,
                        videoUrl: url,
                        title: tabs[0].title.replace(' - YouTube', '').trim()
                    };

                    currentVideoTitle.textContent = activeTabInfo.title;
                    currentVideoChannel.textContent = 'YouTube Video Detected';
                    currentVideoCard.style.display = 'flex';
                }
            }
        }
    });

    // Convert button in popup
    btnConvertCurrent.addEventListener('click', () => {
        if (!activeTabInfo) return;

        btnConvertCurrent.disabled = true;
        btnConvertCurrent.querySelector('span').textContent = 'Starting Download...';

        chrome.runtime.sendMessage({
            action: 'START_DOWNLOAD',
            data: {
                videoId: activeTabInfo.videoId,
                videoUrl: activeTabInfo.videoUrl,
                title: activeTabInfo.title,
                quality: qualitySelect.value,
                format: 'mp3'
            }
        }, (res) => {
            btnConvertCurrent.disabled = false;
            if (res && res.success) {
                btnConvertCurrent.querySelector('span').textContent = '✓ Download Triggered!';
                setTimeout(() => {
                    btnConvertCurrent.querySelector('span').textContent = 'Download MP3 Now';
                    loadHistory();
                }, 2500);
            } else {
                btnConvertCurrent.querySelector('span').textContent = 'Failed';
                setTimeout(() => {
                    btnConvertCurrent.querySelector('span').textContent = 'Download MP3 Now';
                }, 3000);
            }
        });
    });

    // Load History
    function loadHistory() {
        chrome.runtime.sendMessage({ action: 'GET_HISTORY' }, (res) => {
            const history = (res && res.history) || [];
            if (history.length === 0) {
                historyList.innerHTML = '<div class="empty-history">No recent conversions yet</div>';
                return;
            }

            historyList.innerHTML = history.slice(0, 5).map(item => `
                <div class="history-item">
                    <span class="history-item-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</span>
                    <span class="history-item-badge">${item.quality}k ${item.format.toUpperCase()}</span>
                </div>
            `).join('');
        });
    }

    // Clear History
    btnClearHistory.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'CLEAR_HISTORY' }, () => {
            loadHistory();
        });
    });

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>"']/g, function (m) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[m];
        });
    }

    // Initial load
    checkStatus();
    loadHistory();
});
