# HolaSpeak Google TTS service

This Cloud Run service turns short Spanish text into MP3 audio. Google credentials
come from the Cloud Run service identity (Application Default Credentials); no
service-account JSON key is stored in this repository or sent to the browser.

## Deploy

1. In Google Cloud Console, select a project with billing enabled and enable the
   Cloud Text-to-Speech API and Cloud Run.
2. Deploy this folder as a Cloud Run service in `asia-northeast3` (Seoul). Allow
   unauthenticated invocation so the GitHub Pages app can call it. The API itself
   only accepts the configured site origin and limits each synthesis request to
   240 characters.
3. Set `ALLOWED_ORIGINS` to `https://gimiyoni6378-dot.github.io` (add any custom
   domain as a comma-separated value if one is used later).
4. Assign a dedicated Cloud Run service identity and grant it only the
   permissions needed for Cloud Text-to-Speech. Do not download or commit a
   service-account key.
5. Copy the resulting service URL, append `/synthesize`, and place it in
   `tts-config.js` as `window.HOLA_TTS_API_URL`.
6. Publish the updated site to GitHub Pages. Confirm `/health` returns `{"ok":true}`
   and try a pronunciation button on the live page.

## Audio cache

The website stores each generated MP3 in that browser's IndexedDB, keyed by the
voice and exact text. Replaying a cached phrase does not call Google again. The
cache is local to each browser/device; the first play on another device generates
its own copy. If browser storage is unavailable, playback still works but the
audio may be regenerated on later plays.

## Cost guard

The service is publicly callable so the public site can use it. CORS only limits
browser origins; it is not authentication and does not stop direct API clients.
Before enabling billing, set a Cloud Text-to-Speech quota that fits the intended
monthly use and configure a billing budget alert. The app limits request size,
but a project quota is the reliable usage cap.
