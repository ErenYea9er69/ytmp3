// YouTube to MP3 Extension - Bulletproof Injected Script with Live Progress

(function () {
    'use strict';

    console.log('[YT to MP3] Script initialized on:', window.location.href);

    let currentVideoId = null;
    let isProcessing = false;
    let progressPollInterval = null;

    const MUSIC_ICON = `
        <svg class="ytmp3-icon" viewBox="0 0 24 24">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
        </svg>
    `;

    const CHEVRON_ICON = `
        <svg class="ytmp3-chevron" viewBox="0 0 24 24">
            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
        </svg>
    `;

    const CHECK_ICON = `
        <svg class="ytmp3-icon" viewBox="0 0 24 24" style="color:#52c41a">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
        </svg>
    `;

    function getVideoId() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('v');
    }

    function isWatchPage() {
        return window.location.pathname.startsWith('/watch') && !!getVideoId();
    }

    function getVideoTitle() {
        const titleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string') ||
            document.querySelector('#title h1 yt-formatted-string') ||
            document.querySelector('meta[name="title"]');

        if (titleEl) {
            return titleEl.innerText || titleEl.getAttribute('content') || document.title.replace(' - YouTube', '').trim();
        }
        return document.title.replace(' - YouTube', '').trim() || 'youtube-audio';
    }

    function createToast(title, message, type = 'info', hasProgressBar = false) {
        let container = document.getElementById('ytmp3-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'ytmp3-toast-container';
            container.className = 'ytmp3-toast-container';
            document.body.appendChild(container);
        }

        let toast = document.getElementById('ytmp3-active-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'ytmp3-active-toast';
            toast.className = `ytmp3-toast toast-${type}`;
            container.appendChild(toast);
        }

        const iconHtml = type === 'success' ? CHECK_ICON : MUSIC_ICON;

        toast.innerHTML = `
            <div class="ytmp3-toast-header">
                <div class="ytmp3-toast-icon-wrap">${iconHtml}</div>
                <div class="ytmp3-toast-content">
                    <div class="ytmp3-toast-title">${escapeHtml(title)}</div>
                    <div class="ytmp3-toast-desc" id="ytmp3-toast-desc">${escapeHtml(message)}</div>
                </div>
                <div class="ytmp3-toast-close" title="Close">✕</div>
            </div>
            ${hasProgressBar ? `
                <div class="ytmp3-toast-progress-track">
                    <div class="ytmp3-toast-progress-fill" id="ytmp3-toast-fill" style="width: 1%;"></div>
                </div>
            ` : ''}
        `;

        toast.querySelector('.ytmp3-toast-close').addEventListener('click', () => {
            toast.remove();
        });

        if (type === 'success' || type === 'error') {
            setTimeout(() => {
                if (toast && toast.parentNode) toast.remove();
            }, 5000);
        }

        return toast;
    }

    function updateToastProgress(percent, stageText) {
        const desc = document.getElementById('ytmp3-toast-desc');
        const fill = document.getElementById('ytmp3-toast-fill');
        if (desc) desc.textContent = `${stageText} (${percent}%)`;
        if (fill) fill.style.width = `${percent}%`;
    }

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

    function triggerDownload(quality = '320', format = 'mp3') {
        if (isProcessing) return;

        const videoId = getVideoId();
        if (!videoId) return;

        const title = getVideoTitle();
        const videoUrl = window.location.href;
        const jobId = 'job_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

        isProcessing = true;
        updateButtonProgress(1, 'Converting 1%');
        createToast(title, `Connecting to local converter...`, 'info', true);

        if (progressPollInterval) clearInterval(progressPollInterval);

        progressPollInterval = setInterval(() => {
            chrome.runtime.sendMessage({ action: 'CHECK_PROGRESS', jobId }, (res) => {
                if (res && res.success && res.data) {
                    const { percent, stage, completed } = res.data;
                    if (percent > 0) {
                        updateButtonProgress(percent, `MP3 ${percent}%`);
                        updateToastProgress(percent, stage || 'Converting');
                    }

                    if (completed || percent >= 100) {
                        clearInterval(progressPollInterval);
                        progressPollInterval = null;
                        isProcessing = false;
                        updateButtonState('success', '✓ 100% Ready!');
                        createToast(title, '✓ Download complete! (100%)', 'success', false);
                        setTimeout(() => updateButtonState('default'), 3500);
                    }
                }
            });
        }, 200);

        chrome.runtime.sendMessage({
            action: 'START_DOWNLOAD',
            data: {
                videoId,
                videoUrl,
                title,
                quality,
                format,
                jobId
            }
        }, (response) => {
            if (chrome.runtime.lastError) {
                if (progressPollInterval) clearInterval(progressPollInterval);
                isProcessing = false;
                updateButtonState('error', 'Error');
                createToast('Extension Error', chrome.runtime.lastError.message, 'error');
                setTimeout(() => updateButtonState('default'), 3000);
                return;
            }

            if (response && response.serverOffline) {
                if (progressPollInterval) clearInterval(progressPollInterval);
                isProcessing = false;
                updateButtonState('default');

                const toast = createToast('Local Server Offline', 'Run start-server.bat in your ytmp3 folder to enable 1-click downloads with 0 external APIs!', 'warning', false);
                const extra = document.createElement('div');
                extra.style.marginTop = '8px';
                extra.innerHTML = `
                    <div style="font-size:11px; color:#ffaa00; background:rgba(255,170,0,0.12); padding:6px 8px; border-radius:6px; margin-bottom:6px;">
                        💡 Double-click <strong>start-server.bat</strong> (or <strong>start-server-background.vbs</strong>).
                    </div>
                    <a href="https://y2meta.mobi/youtube/${videoId}" target="_blank" style="display:inline-block; text-align:center; font-size:11px; color:#ffffff; background:#ff0033; padding:5px 10px; border-radius:6px; text-decoration:none; font-weight:600;">
                        Or Open Fast Web Converter ↗
                    </a>
                `;
                toast.querySelector('.ytmp3-toast-content').appendChild(extra);
            }
        });
    }

    function updateButtonProgress(percent, text) {
        const wrapper = document.getElementById('ytmp3-injected-container');
        if (!wrapper) return;

        const labelEl = wrapper.querySelector('.ytmp3-label');
        const iconEl = wrapper.querySelector('.ytmp3-icon-wrap');
        const progressBar = wrapper.querySelector('.ytmp3-btn-progress-bar');
        const pillBtn = wrapper.querySelector('.ytmp3-pill-btn');

        if (pillBtn) pillBtn.classList.add('is-active');
        if (iconEl) iconEl.innerHTML = `<span class="ytmp3-spinner"></span>`;
        if (labelEl) labelEl.textContent = text;
        if (progressBar) progressBar.style.width = `${percent}%`;
        wrapper.classList.remove('menu-open');
    }

    function updateButtonState(state, text = '') {
        const wrapper = document.getElementById('ytmp3-injected-container');
        if (!wrapper) return;

        const labelEl = wrapper.querySelector('.ytmp3-label');
        const iconEl = wrapper.querySelector('.ytmp3-icon-wrap');
        const progressBar = wrapper.querySelector('.ytmp3-btn-progress-bar');
        const pillBtn = wrapper.querySelector('.ytmp3-pill-btn');

        if (pillBtn) pillBtn.classList.remove('is-active');

        if (state === 'success') {
            iconEl.innerHTML = CHECK_ICON;
            labelEl.textContent = text || 'Done!';
            if (progressBar) progressBar.style.width = '100%';
        } else if (state === 'error') {
            iconEl.innerHTML = `⚠️`;
            labelEl.textContent = text || 'Failed';
            if (progressBar) progressBar.style.width = '0%';
        } else {
            iconEl.innerHTML = MUSIC_ICON;
            labelEl.textContent = 'MP3';
            if (progressBar) progressBar.style.width = '0%';
        }
    }

    function injectButton() {
        if (!isWatchPage()) return;

        const videoId = getVideoId();
        const existingBtn = document.getElementById('ytmp3-injected-container');

        // Check if button is already present and attached in the DOM
        if (existingBtn && document.body.contains(existingBtn) && currentVideoId === videoId) {
            return;
        }

        if (existingBtn) {
            existingBtn.remove();
        }

        currentVideoId = videoId;

        // Locating the target container on modern YouTube:
        // Priority 1: #top-level-buttons-computed (The action buttons row)
        const topLevelButtons = document.querySelector('#top-level-buttons-computed') ||
            document.querySelector('ytd-menu-renderer.ytd-watch-metadata #top-level-buttons-computed') ||
            document.querySelector('#actions-inner #top-level-buttons-computed');

        // Priority 2: actions-inner or actions
        const actionsContainer = document.querySelector('ytd-watch-metadata #actions-inner') ||
            document.querySelector('ytd-watch-metadata #actions') ||
            document.querySelector('#actions');

        // Priority 3: owner container next to Subscribe button
        const ownerContainer = document.querySelector('ytd-watch-metadata #owner') ||
            document.querySelector('#owner');

        if (!topLevelButtons && !actionsContainer && !ownerContainer) {
            return; // Not yet rendered by YouTube
        }

        const wrapper = document.createElement('div');
        wrapper.id = 'ytmp3-injected-container';
        wrapper.className = 'ytmp3-wrapper';

        wrapper.innerHTML = `
            <div class="ytmp3-pill-btn" title="Download YouTube audio as 320kbps MP3">
                <div class="ytmp3-btn-progress-bar"></div>
                <div class="ytmp3-action-trigger" id="ytmp3-btn-action">
                    <span class="ytmp3-icon-wrap">${MUSIC_ICON}</span>
                    <span class="ytmp3-label">MP3</span>
                </div>
                <div class="ytmp3-pill-divider"></div>
                <div class="ytmp3-dropdown-trigger" id="ytmp3-btn-dropdown" title="Choose quality">
                    ${CHEVRON_ICON}
                </div>
            </div>
            <div class="ytmp3-menu" id="ytmp3-menu">
                <div class="ytmp3-menu-header">Audio (Direct MP3)</div>
                <div class="ytmp3-menu-item" data-quality="320" data-format="mp3">
                    <div class="ytmp3-menu-item-left">🎵 320 kbps</div>
                    <span class="ytmp3-badge">Studio</span>
                </div>
                <div class="ytmp3-menu-item" data-quality="256" data-format="mp3">
                    <div class="ytmp3-menu-item-left">🎵 256 kbps</div>
                    <span style="font-size:11px;color:#aaa">High</span>
                </div>
                <div class="ytmp3-menu-item" data-quality="192" data-format="mp3">
                    <div class="ytmp3-menu-item-left">🎵 192 kbps</div>
                    <span style="font-size:11px;color:#aaa">Standard</span>
                </div>
                <div class="ytmp3-menu-item" data-quality="128" data-format="mp3">
                    <div class="ytmp3-menu-item-left">🎵 128 kbps</div>
                    <span style="font-size:11px;color:#aaa">Fast</span>
                </div>
                <div class="ytmp3-menu-divider"></div>
                <div class="ytmp3-menu-header">Video (Direct MP4)</div>
                <div class="ytmp3-menu-item" data-quality="1080" data-format="mp4">
                    <div class="ytmp3-menu-item-left">🎬 MP4 Video</div>
                    <span class="ytmp3-badge" style="background:#1890ff">HD</span>
                </div>
            </div>
        `;

        wrapper.querySelector('#ytmp3-btn-action').addEventListener('click', (e) => {
            e.stopPropagation();
            chrome.storage.local.get(['preferredQuality'], (res) => {
                const preferredQuality = (res && res.preferredQuality) || '320';
                triggerDownload(preferredQuality, 'mp3');
            });
        });

        const dropdownTrigger = wrapper.querySelector('#ytmp3-btn-dropdown');
        dropdownTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            wrapper.classList.toggle('menu-open');
        });

        wrapper.querySelectorAll('.ytmp3-menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                wrapper.classList.remove('menu-open');
                const quality = item.getAttribute('data-quality');
                const format = item.getAttribute('data-format');
                triggerDownload(quality, format);
            });
        });

        document.addEventListener('click', (e) => {
            if (!wrapper.contains(e.target)) {
                wrapper.classList.remove('menu-open');
            }
        });

        // Insertion Strategy:
        if (topLevelButtons) {
            // If top-level-buttons has children (Like/Dislike is child 0, Share is child 1),
            // insert between Like/Dislike and Share!
            if (topLevelButtons.children.length > 1) {
                topLevelButtons.insertBefore(wrapper, topLevelButtons.children[1]);
            } else {
                topLevelButtons.appendChild(wrapper);
            }
            console.log('[YT to MP3] Injected button into #top-level-buttons-computed');
        } else if (actionsContainer) {
            actionsContainer.appendChild(wrapper);
            console.log('[YT to MP3] Injected button into #actions-inner');
        } else if (ownerContainer) {
            ownerContainer.appendChild(wrapper);
            console.log('[YT to MP3] Injected button into #owner');
        }
    }

    // High frequency injector ensuring the button is ALWAYS visible
    function init() {
        injectButton();

        // High frequency checks during the initial load
        for (let t of [100, 300, 600, 1000, 1500, 2000, 3000, 4000]) {
            setTimeout(injectButton, t);
        }

        // Listen to YouTube SPA navigation events
        window.addEventListener('yt-navigate-finish', () => {
            for (let t of [100, 300, 600, 1000, 2000]) {
                setTimeout(injectButton, t);
            }
        });

        window.addEventListener('yt-page-data-updated', () => {
            setTimeout(injectButton, 200);
            setTimeout(injectButton, 800);
        });

        window.addEventListener('spfdone', () => {
            setTimeout(injectButton, 300);
        });

        // DOM Mutation Observer monitoring for button presence
        const observer = new MutationObserver(() => {
            if (isWatchPage()) {
                const btn = document.getElementById('ytmp3-injected-container');
                if (!btn || !document.body.contains(btn)) {
                    injectButton();
                }
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Continuous interval safeguard
        setInterval(() => {
            if (isWatchPage()) {
                const btn = document.getElementById('ytmp3-injected-container');
                if (!btn || !document.body.contains(btn)) {
                    injectButton();
                }
            }
        }, 800);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
