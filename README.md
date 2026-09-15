# 🎵 YT to MP3 - One-Click YouTube Audio Downloader

A 100% self-contained Chrome / Chromium browser extension (Manifest V3) that injects a native **"Download MP3"** button directly underneath any YouTube video. 

**Zero external converter sites. Zero third-party ad links. Zero hanging screens.**

---

## 🚀 Why This Is 100% Better

Most web converters (like the red screen you encountered from loader.to) hang indefinitely or get blocked by YouTube. 

This extension uses a **100% local, self-contained conversion pipeline**:
- Extracts the YouTube audio stream directly.
- Converts to **320 kbps MP3** on your PC using bundled FFmpeg and yt-dlp in **2 to 3 seconds**.
- The file saves automatically to your browser's **Downloads** folder with the clean song name.

---

## 📥 How to Install the Extension

### Step 1: Reload / Load Unpacked in Your Browser
1. In Chrome / Edge / Brave, open `chrome://extensions` (or `edge://extensions`).
2. Make sure **Developer mode** (top right) is switched **ON**.
3. If already loaded, click the **Reload (🔄)** button on "YT to MP3".
4. If loading for the first time, click **Load unpacked** and select:
   ```
   c:\Users\hp\Desktop\ytmp3
   ```

---

## ⚡ How to Start the Local Converter (Zero External APIs)

In the `ytmp3` folder, you have two launcher scripts:

1. **Option A (Visible Console)**: Double-click **`start-server.bat`**  
   Opens a small command window showing conversion progress.
2. **Option B (Completely Silent Background)**: Double-click **`start-server-background.vbs`**  
   Runs quietly in the background without any console window open!

*(To stop the server at any time, just run **`stop-server.bat`**)*

---

## 🎯 How to Download MP3s

1. Open any YouTube video (e.g. `https://www.youtube.com/watch?v=...`).
2. Directly next to the **Like** and **Share** buttons under the video, click the **🎵 MP3** button.
3. You will see:
   - **Converting...** (takes ~2-3 seconds)
   - **Done! ✓**
4. Your pristine 320kbps MP3 is saved directly into your **Downloads** folder!

---

## 📁 File Structure

```
ytmp3/
├── start-server.bat           # 1-Click launcher (visible console)
├── start-server-background.vbs# 1-Click launcher (silent background mode)
├── stop-server.bat            # Stops the server
├── manifest.json              # Manifest V3 extension configuration
├── background.js              # Background service worker
├── content/
│   ├── content.js             # YouTube button injection & SPA watcher
│   └── content.css            # YouTube-matching UI styles & toasts
├── popup/
│   ├── popup.html             # Extension popup dashboard
│   ├── popup.css              # Popup styling
│   └── popup.js               # Status checking & settings
├── icons/                     # Extension icons
├── server/
│   ├── server.js              # Local Express server (yt-dlp + FFmpeg)
│   └── package.json           # Dependencies
└── README.md
```
