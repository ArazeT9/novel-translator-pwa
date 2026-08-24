Novel Translator PWA v0.1.1

What this version does
- Runs as an installable web app on iPad/iPhone/desktop browsers.
- Paste a novel chapter, press Translate, and read Thai inside the app.
- Uses Gemini 3.5 Flash-Lite -> 3.1 Flash-Lite -> 3.6 Flash fallback route.
- Adaptive paragraph chunking, micro-context, concurrency 2.
- Per-novel Source of Truth and Style Memory.
- Natural Feedback / Remember parser.
- Local IndexedDB translation cache.
- API key and memory are stored locally in the browser.

Important limitation
- A PWA cannot replace text inside an unrelated Safari webpage like a Safari extension.
- The chapter must be copied/pasted into this app.
- The app must be served over HTTPS to be installable as a PWA and to use its service worker.

GitHub Pages
- Publish branch: main
- Folder: /(root)
- Expected URL: https://arazet9.github.io/novel-translator-pwa/

On iPad
1. Open the GitHub Pages URL in Safari.
2. Share -> Add to Home Screen.
3. Open Novel Translator from the Home Screen.
4. Advanced -> enter Gemini API Key.
5. Copy novel chapter text from the website and paste into Novel Translator.