Novel Translator PWA v0.1

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