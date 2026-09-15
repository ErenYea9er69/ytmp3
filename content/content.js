// YouTube to MP3 Extension - Content Script
// Strategy: Insert OUTSIDE #top-level-buttons-computed (as a sibling),
// so YouTube's Polymer re-rendering never removes our button.

(function () {
    'use strict';

    // Prevent duplicate initialization if script is injected multiple times
    if (window.__ytmp3_initialized) return;
    window.__ytmp3_initialized = true;

    console.log('[YT to MP3] Content script loaded.');

    let currentVideoId = null;
    let isProcessing = false;
    let progressPollInterval = null;

    const MUSIC_ICON = `<svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`;
    const CHEVRON_ICON = `<svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:currentColor"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/></svg>`;
    const CHECK_ICON = `<svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:#52c41a"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;
    const SPINNER_HTML = `<span style="display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,0.3);border-top-color:#ff0033;border-radius:50%;animation:ytmp3spin 0.6s linear infinite"></span>`;

    function getVideoId() {
        const p = new URLSearchParams(window.location.search);
        return p.get('v');
    }

    function isWatchPage() {
        return window.location.pathname.startsWith('/watch') && !!getVideoId();
    }

    function getVideoTitle() {
        const el = document.querySelector('h1.ytd-watch-metadata yt-formatted-string') ||
            document.querySelector('#title h1 yt-formatted-string') ||
            document.querySelector('meta[name="title"]');
        if (el) return el.innerText || el.getAttribute('content') || document.title.replace(' - YouTube', '').trim();
        return document.title.replace(' - YouTube', '').trim() || 'youtube-audio';
    }

    function escapeHtml(s) {
        if (!s) return '';
        return s.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    }

    // --- TOAST ---
    function showToast(title, msg, type, hasBar) {
        let c = document.getElementById('ytmp3-toast-ctr');
        if (!c) {
            c = document.createElement('div');
            c.id = 'ytmp3-toast-ctr';
            c.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2147483647;pointer-events:none;';
            document.body.appendChild(c);
        }
        let t = document.getElementById('ytmp3-toast');
        if (t) t.remove();
        t = document.createElement('div');
        t.id = 'ytmp3-toast';
        t.style.cssText = 'pointer-events:auto;display:flex;flex-direction:column;gap:8px;background:rgba(20,20,24,0.96);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:14px 16px;color:#fff;box-shadow:0 12px 40px rgba(0,0,0,0.6);min-width:310px;max-width:400px;font-family:Roboto,sans-serif;animation:ytmp3slideup 0.3s ease forwards;';
        const iconColor = type === 'success' ? '#52c41a' : type === 'error' ? '#ff4d4f' : '#ff0033';
        t.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;">
                <div style="width:32px;height:32px;border-radius:50%;background:${iconColor}22;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:${iconColor}">
                    ${type === 'success' ? CHECK_ICON : MUSIC_ICON}
                </div>
                <div style="flex:1;overflow:hidden;">
                    <div id="ytmp3-toast-title" style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(title)}</div>
                    <div id="ytmp3-toast-desc" style="font-size:11.5px;color:#bbb;line-height:1.3;">${escapeHtml(msg)}</div>
                </div>
                <div id="ytmp3-toast-close" style="cursor:pointer;color:#666;padding:4px;font-size:14px;">✕</div>
            </div>
            ${hasBar ? '<div style="width:100%;height:5px;border-radius:3px;background:rgba(255,255,255,0.1);overflow:hidden;margin-top:2px;"><div id="ytmp3-toast-bar" style="height:100%;width:1%;background:linear-gradient(90deg,#ff0033,#ff4d4f);border-radius:3px;transition:width 0.2s ease;"></div></div>' : ''}
        `;
        t.querySelector('#ytmp3-toast-close').onclick = () => t.remove();
        c.appendChild(t);
        if (type === 'success' || type === 'error') setTimeout(() => { if (t.parentNode) t.remove(); }, 5000);
    }

    function updateToast(percent, stage) {
        const d = document.getElementById('ytmp3-toast-desc');
        const b = document.getElementById('ytmp3-toast-bar');
        if (d) d.textContent = `${stage} (${percent}%)`;
        if (b) b.style.width = percent + '%';
    }

    // --- BUTTON STATE ---
    function setBtnProgress(percent, text) {
        const w = document.getElementById('ytmp3-btn');
        if (!w) return;
        const lbl = w.querySelector('#ytmp3-lbl');
        const ico = w.querySelector('#ytmp3-ico');
        const bar = w.querySelector('#ytmp3-bar');
        if (lbl) lbl.textContent = text;
        if (ico) ico.innerHTML = SPINNER_HTML;
        if (bar) bar.style.width = percent + '%';
    }

    function setBtnState(state, text) {
        const w = document.getElementById('ytmp3-btn');
        if (!w) return;
        const lbl = w.querySelector('#ytmp3-lbl');
        const ico = w.querySelector('#ytmp3-ico');
        const bar = w.querySelector('#ytmp3-bar');
        if (state === 'success') {
            if (ico) ico.innerHTML = CHECK_ICON;
            if (lbl) lbl.textContent = text || 'Done!';
            if (bar) bar.style.width = '100%';
        } else if (state === 'error') {
            if (ico) ico.innerHTML = '⚠️';
            if (lbl) lbl.textContent = text || 'Error';
            if (bar) bar.style.width = '0%';
        } else {
            if (ico) ico.innerHTML = MUSIC_ICON;
            if (lbl) lbl.textContent = 'MP3';
            if (bar) bar.style.width = '0%';
        }
    }

    // --- DOWNLOAD ---
    function triggerDownload(quality, format) {
        if (isProcessing) return;
        const videoId = getVideoId();
        if (!videoId) return;
        const title = getVideoTitle();
        const videoUrl = window.location.href;
        const jobId = 'j' + Date.now() + Math.random().toString(36).substring(2, 5);

        isProcessing = true;
        setBtnProgress(1, '1%');
        showToast(title, 'Starting conversion...', 'info', true);

        if (progressPollInterval) clearInterval(progressPollInterval);
        progressPollInterval = setInterval(() => {
            try {
                chrome.runtime.sendMessage({ action: 'CHECK_PROGRESS', jobId }, (r) => {
                    if (chrome.runtime.lastError) return;
                    if (r && r.success && r.data) {
                        const { percent, stage, completed } = r.data;
                        if (percent > 0) {
                            setBtnProgress(percent, percent + '%');
                            updateToast(percent, stage || 'Converting');
                        }
                        if (completed || percent >= 100) {
                            clearInterval(progressPollInterval);
                            progressPollInterval = null;
                            isProcessing = false;
                            setBtnState('success', '✓ Done!');
                            showToast(title, 'Download complete!', 'success', false);
                            setTimeout(() => setBtnState('default'), 3500);
                        }
                    }
                });
            } catch (e) {}
        }, 250);

        try {
            chrome.runtime.sendMessage({
                action: 'START_DOWNLOAD',
                data: { videoId, videoUrl, title, quality, format, jobId }
            }, (response) => {
                if (chrome.runtime.lastError) {
                    clearInterval(progressPollInterval);
                    isProcessing = false;
                    setBtnState('error', 'Error');
                    showToast('Error', chrome.runtime.lastError.message, 'error', false);
                    setTimeout(() => setBtnState('default'), 3000);
                    return;
                }
                if (response && response.serverOffline) {
                    clearInterval(progressPollInterval);
                    isProcessing = false;
                    setBtnState('default');
                    showToast('Server Offline', 'Run start-server.bat in your ytmp3 folder first!', 'error', false);
                }
            });
        } catch (e) {
            clearInterval(progressPollInterval);
            isProcessing = false;
            setBtnState('error', 'Error');
            showToast('Extension Error', 'Could not connect to extension. Try reloading the page.', 'error', false);
            setTimeout(() => setBtnState('default'), 3000);
        }
    }

    // --- INJECT ---
    function injectButton() {
        if (!isWatchPage()) return;
        const videoId = getVideoId();

        // If our button exists and is in the DOM for this video, skip
        const existing = document.getElementById('ytmp3-btn');
        if (existing && document.body.contains(existing) && currentVideoId === videoId) return;
        if (existing) existing.remove();

        currentVideoId = videoId;

        // STRATEGY: Find the parent of #top-level-buttons-computed and append AFTER it.
        // This way YouTube never stomps our element when it re-renders its own computed buttons.
        const topLevel = document.querySelector('#top-level-buttons-computed');
        if (!topLevel) {
            console.log('[YT to MP3] Waiting for #top-level-buttons-computed...');
            return;
        }

        const parent = topLevel.parentElement;
        if (!parent) return;

        // Create the button with fully inline styles (no dependency on CSS file for critical display)
        const btn = document.createElement('div');
        btn.id = 'ytmp3-btn';
        btn.style.cssText = 'display:inline-flex !important;align-items:center !important;position:relative !important;height:36px !important;border-radius:18px !important;background:rgba(255,255,255,0.1) !important;color:#f1f1f1 !important;font-family:Roboto,"YouTube Sans",Arial,sans-serif !important;font-size:14px !important;font-weight:500 !important;cursor:pointer !important;overflow:visible !important;flex-shrink:0 !important;margin-left:8px !important;transition:background 0.2s ease !important;user-select:none !important;vertical-align:middle !important;';

        // Check if dark mode
        const isDark = document.documentElement.hasAttribute('dark') || document.documentElement.getAttribute('dark') !== null;
        if (!isDark) {
            btn.style.background = 'rgba(0,0,0,0.05)';
            btn.style.color = '#0f0f0f';
        }

        btn.innerHTML = `
            <div id="ytmp3-bar" style="position:absolute;top:0;left:0;height:100%;width:0%;background:linear-gradient(90deg,rgba(255,0,51,0.3),rgba(255,0,51,0.55));transition:width 0.2s ease;pointer-events:none;border-radius:18px;z-index:1;"></div>
            <div id="ytmp3-main" style="display:flex;align-items:center;gap:6px;padding:0 12px 0 14px;height:100%;position:relative;z-index:2;cursor:pointer;">
                <span id="ytmp3-ico" style="display:flex;align-items:center;">${MUSIC_ICON}</span>
                <span id="ytmp3-lbl" style="font-size:14px;font-weight:500;white-space:nowrap;">MP3</span>
            </div>
            <div style="width:1px;height:16px;background:rgba(255,255,255,0.15);position:relative;z-index:2;"></div>
            <div id="ytmp3-dropdown-btn" style="display:flex;align-items:center;justify-content:center;width:32px;height:100%;position:relative;z-index:2;cursor:pointer;">
                ${CHEVRON_ICON}
            </div>
        `;

        // Dropdown menu
        const menu = document.createElement('div');
        menu.id = 'ytmp3-menu';
        menu.style.cssText = 'display:none;position:absolute;top:calc(100% + 8px);right:0;min-width:210px;background:rgba(28,28,32,0.98);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:6px;box-shadow:0 12px 36px rgba(0,0,0,0.6);z-index:999999;flex-direction:column;font-family:Roboto,sans-serif;';
        if (!isDark) {
            menu.style.background = 'rgba(255,255,255,0.98)';
            menu.style.borderColor = 'rgba(0,0,0,0.1)';
            menu.style.boxShadow = '0 12px 36px rgba(0,0,0,0.15)';
        }

        const items = [
            { q: '320', f: 'mp3', label: '🎵 320 kbps', tag: 'Studio', tagBg: '#ff0033' },
            { q: '256', f: 'mp3', label: '🎵 256 kbps', tag: 'High', tagBg: '' },
            { q: '192', f: 'mp3', label: '🎵 192 kbps', tag: 'Standard', tagBg: '' },
            { q: '128', f: 'mp3', label: '🎵 128 kbps', tag: 'Fast', tagBg: '' },
            { divider: true },
            { q: '1080', f: 'mp4', label: '🎬 MP4 Video', tag: 'HD', tagBg: '#1890ff' },
        ];

        let menuHTML = '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#888;padding:5px 10px 3px;">Audio (MP3)</div>';
        for (const item of items) {
            if (item.divider) {
                menuHTML += '<div style="height:1px;background:rgba(255,255,255,0.08);margin:4px 0;"></div><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#888;padding:5px 10px 3px;">Video</div>';
                continue;
            }
            const tagStyle = item.tagBg
                ? `font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;background:${item.tagBg};color:#fff;`
                : `font-size:11px;color:#aaa;`;
            menuHTML += `<div class="ytmp3-mi" data-q="${item.q}" data-f="${item.f}" style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-radius:6px;font-size:13px;color:${isDark ? '#eee' : '#222'};cursor:pointer;transition:background 0.12s;">${item.label}<span style="${tagStyle}">${item.tag}</span></div>`;
        }
        menu.innerHTML = menuHTML;

        // Wrap in a positioned container
        const container = document.createElement('div');
        container.id = 'ytmp3-container';
        container.style.cssText = 'display:inline-flex !important;align-items:center !important;position:relative !important;vertical-align:middle !important;flex-shrink:0 !important;';
        container.appendChild(btn);
        container.appendChild(menu);

        // Event: main button click
        btn.querySelector('#ytmp3-main').addEventListener('click', (e) => {
            e.stopPropagation();
            let pq = '320';
            try {
                chrome.storage.local.get(['preferredQuality'], (r) => {
                    pq = (r && r.preferredQuality) || '320';
                    triggerDownload(pq, 'mp3');
                });
            } catch (err) {
                triggerDownload(pq, 'mp3');
            }
        });

        // Event: dropdown toggle
        let menuOpen = false;
        btn.querySelector('#ytmp3-dropdown-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            menuOpen = !menuOpen;
            menu.style.display = menuOpen ? 'flex' : 'none';
        });

        // Event: menu item click
        menu.querySelectorAll('.ytmp3-mi').forEach(mi => {
            mi.addEventListener('mouseenter', () => { mi.style.background = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'; });
            mi.addEventListener('mouseleave', () => { mi.style.background = 'transparent'; });
            mi.addEventListener('click', (e) => {
                e.stopPropagation();
                menuOpen = false;
                menu.style.display = 'none';
                triggerDownload(mi.dataset.q, mi.dataset.f);
            });
        });

        // Event: hover on main button
        btn.addEventListener('mouseenter', () => {
            btn.style.background = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.background = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)';
        });

        // Close menu on outside click
        document.addEventListener('click', () => {
            menuOpen = false;
            menu.style.display = 'none';
        });

        // INSERT: as a sibling AFTER #top-level-buttons-computed inside its parent.
        // This ensures YouTube's Polymer re-rendering of #top-level-buttons-computed never removes our button.
        parent.insertBefore(container, topLevel.nextSibling);

        console.log('[YT to MP3] ✅ Button injected (as sibling of #top-level-buttons-computed) for video:', videoId);
    }

    // --- INIT ---
    function init() {
        // Inject the global keyframe animation
        if (!document.getElementById('ytmp3-style')) {
            const style = document.createElement('style');
            style.id = 'ytmp3-style';
            style.textContent = `@keyframes ytmp3spin { to { transform: rotate(360deg); } } @keyframes ytmp3slideup { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }`;
            document.head.appendChild(style);
        }

        injectButton();

        // Retry injection at increasing intervals during initial page load
        [200, 500, 800, 1200, 2000, 3000, 5000].forEach(t => setTimeout(injectButton, t));

        // YouTube SPA navigation events
        window.addEventListener('yt-navigate-finish', () => {
            currentVideoId = null; // Reset so button gets recreated for new video
            [200, 500, 1000, 2000, 3000].forEach(t => setTimeout(injectButton, t));
        });

        window.addEventListener('yt-page-data-updated', () => {
            setTimeout(injectButton, 300);
            setTimeout(injectButton, 1000);
        });

        // MutationObserver: re-inject if our button gets removed
        const observer = new MutationObserver(() => {
            if (!isWatchPage()) return;
            const btn = document.getElementById('ytmp3-btn');
            if (!btn || !document.body.contains(btn)) {
                injectButton();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });

        // Periodic check every 1.5s
        setInterval(() => {
            if (!isWatchPage()) return;
            const btn = document.getElementById('ytmp3-btn');
            if (!btn || !document.body.contains(btn)) {
                injectButton();
            }
        }, 1500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
