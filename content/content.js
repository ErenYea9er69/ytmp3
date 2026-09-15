// YouTube to MP3 Extension - Injected Content Script

(function () {
    'use strict';

    let currentVideoId = null;
    let isProcessing = false;

    // SVG Icons
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

    function getVideoTitle() {
        const titleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string') ||
            document.querySelector('#title h1 yt-formatted-string') ||
            document.querySelector('meta[name="title"]');

        if (titleEl) {
            return titleEl.innerText || titleEl.getAttribute('content') || document.title.replace(' - YouTube', '').trim();
        }
        return document.title.replace(' - YouTube', '').trim() || 'youtube-audio';
    }

    function isWatchPage() {
        return window.location.pathname === '/watch' && !!getVideoId();
    }

    function createToast(title, message, type = 'info', extraHtml = '') {
        let container = document.getElementById('ytmp3-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'ytmp3-toast-container';
            container.className = 'ytmp3-toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `ytmp3-toast toast-${type}`;

        const iconHtml = type === 'success' ? CHECK_ICON : MUSIC_ICON;

        toast.innerHTML = `
            <div class="ytmp3-toast-icon-wrap">
                ${iconHtml}
            </div>
            <div class="ytmp3-toast-content">
                <div class="ytmp3-toast-title">${escapeHtml(title)}</div>
                <div class="ytmp3-toast-desc">${escapeHtml(message)}</div>
                ${extraHtml}
            </div>
            <div class="ytmp3-toast-close" title="Close">✕</div>
        `;

        toast.querySelector('.ytmp3-toast-close').addEventListener('click', () => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            setTimeout(() => toast.remove(), 300);
        });

        container.appendChild(toast);

        // Auto dismiss after 7 seconds if not an offline warning
        if (type !== 'warning') {
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.style.opacity = '0';
                    toast.style.transform = 'translateY(10px)';
                    setTimeout(() => toast.remove(), 300);
                }
            }, 7000);
        }
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

        isProcessing = true;
        updateButtonState('loading', 'Converting...');
        createToast(title, `Converting to ${quality}kbps ${format.toUpperCase()} (100% locally)...`, 'info');

        chrome.runtime.sendMessage({
            action: 'START_DOWNLOAD',
            data: {
                videoId,
                videoUrl,
                title,
                quality,
                format
            }
        }, (response) => {
            isProcessing = false;

            if (chrome.runtime.lastError) {
                console.error('[YT to MP3] Runtime error:', chrome.runtime.lastError);
                updateButtonState('error', 'Error');
                createToast('Extension Error', chrome.runtime.lastError.message, 'error');
                setTimeout(() => updateButtonState('default'), 3000);
                return;
            }

            if (response && response.success) {
                updateButtonState('success', 'Ready!');
                createToast(title, `Download complete! Saved directly to your Downloads folder.`, 'success');
                setTimeout(() => updateButtonState('default'), 4000);
            } else if (response && response.serverOffline) {
                updateButtonState('default');
                const extra = `
                    <div style="margin-top:8px; display:flex; flex-direction:column; gap:6px;">
                        <div style="font-size:11px; color:#ffaa00; background:rgba(255,170,0,0.12); padding:6px 8px; border-radius:6px;">
                            💡 Double-click <strong>start-server.bat</strong> (or <strong>start-server-background.vbs</strong>) in your ytmp3 folder.
                        </div>
                        <a href="https://y2meta.mobi/youtube/${videoId}" target="_blank" style="display:inline-block; text-align:center; font-size:11px; color:#ffffff; background:#ff0033; padding:5px 10px; border-radius:6px; text-decoration:none; font-weight:600; margin-top:2px;">
                            Or Open Fast Web Converter ↗
                        </a>
                    </div>
                `;
                createToast('Local Converter Server Offline', 'To download MP3s directly with 0 ads and 0 external APIs:', 'warning', extra);
            } else {
                updateButtonState('error', 'Failed');
                const errMsg = (response && response.error) || 'Conversion failed.';
                createToast('Conversion Alert', errMsg, 'error');
                setTimeout(() => updateButtonState('default'), 4000);
            }
        });
    }

    function updateButtonState(state, text = '') {
        const wrapper = document.getElementById('ytmp3-injected-container');
        if (!wrapper) return;

        const labelEl = wrapper.querySelector('.ytmp3-label');
        const iconEl = wrapper.querySelector('.ytmp3-icon-wrap');

        if (state === 'loading') {
            iconEl.innerHTML = `<span class="ytmp3-spinner"></span>`;
            labelEl.textContent = text || 'Converting...';
            wrapper.classList.remove('menu-open');
        } else if (state === 'success') {
            iconEl.innerHTML = CHECK_ICON;
            labelEl.textContent = text || 'Done!';
        } else if (state === 'error') {
            iconEl.innerHTML = `⚠️`;
            labelEl.textContent = text || 'Failed';
        } else {
            iconEl.innerHTML = MUSIC_ICON;
            labelEl.textContent = 'MP3';
        }
    }

    function injectButton() {
        if (!isWatchPage()) return;

        const videoId = getVideoId();
        const existingBtn = document.getElementById('ytmp3-injected-container');

        if (existingBtn && currentVideoId === videoId) {
            return;
        }

        if (existingBtn && currentVideoId !== videoId) {
            existingBtn.remove();
        }

        currentVideoId = videoId;

        const targetContainer =
            document.querySelector('#above-the-fold #top-level-buttons-computed') ||
            document.querySelector('ytd-watch-metadata #actions #top-level-buttons-computed') ||
            document.querySelector('#actions-inner #top-level-buttons-computed') ||
            document.querySelector('#top-level-buttons-computed') ||
            document.querySelector('ytd-watch-metadata #actions') ||
            document.querySelector('#owner');

        if (!targetContainer) {
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.id = 'ytmp3-injected-container';
        wrapper.className = 'ytmp3-wrapper';

        wrapper.innerHTML = `
            <div class="ytmp3-pill-btn" title="Download YouTube audio as 320kbps MP3 (100% locally)">
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

        if (targetContainer.id === 'top-level-buttons-computed') {
            targetContainer.insertBefore(wrapper, targetContainer.firstChild);
        } else {
            targetContainer.appendChild(wrapper);
        }

        console.log('[YT to MP3] Ready on video:', videoId);
    }

    function initObserver() {
        injectButton();

        window.addEventListener('yt-navigate-finish', () => {
            setTimeout(injectButton, 400);
            setTimeout(injectButton, 1200);
        });

        window.addEventListener('yt-page-data-updated', () => {
            setTimeout(injectButton, 300);
        });

        window.addEventListener('spfdone', () => {
            setTimeout(injectButton, 500);
        });

        const observer = new MutationObserver(() => {
            if (isWatchPage() && !document.getElementById('ytmp3-injected-container')) {
                injectButton();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        setInterval(() => {
            if (isWatchPage() && !document.getElementById('ytmp3-injected-container')) {
                injectButton();
            }
        }, 2000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initObserver);
    } else {
        initObserver();
    }

})();
