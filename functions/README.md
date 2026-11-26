# Google TTS function (stage 2)

Firebase HTTPS function `tts` validates **Firebase ID tokens** and generates Spanish Neural2 MP3 examples. The legacy `tts-service/` is not the deployment target for this stage.

## Cache and limits

- Canonical key: NFC-normalized, trimmed sentence + voice + speed + pitch + es-ES + MP3 + cache version.
- Browser: up to 150 validated MP3 clips in IndexedDB and 25 decoded clips in memory. Decode failures do not enter persistent cache.
- Server: shared, persistent `_ttsAudio/{sha256}` Firestore documents. Restarting a function does not regenerate existing examples. MP3 is limited to 650 KB to keep a base64 document below Firestore's 1 MiB document limit.
- Same-instance concurrent requests for a key share one generation. Only cache misses reserve generation quota.
- Defaults: 1,000,000 newly generated characters per UTC calendar month for **this app**, 40 generations per user/day, 400 generations globally/day. Firestore transactions reserve quota before calling Google. Failed calls keep their reservation, so the app meter is conservative.
- Defaults can be changed with `TTS_MONTHLY_CHARACTER_LIMIT`, `TTS_USER_DAILY_LIMIT`, `TTS_GLOBAL_DAILY_LIMIT`. These app limits are not Google billing-account quotas and do not include calls from other tools/projects. They do not cap function execution, Firestore reads/storage or all cloud charges.
- `_ttsAudio` and `_ttsUsage` are server-only collections. Existing Firestore rules deny browser access; the Admin SDK uses the function's service identity.
- No learner microphone audio, pronunciation assessment or assessment-response cache is involved in this function.

## Provisioning (requires user billing approval)

1. Keep the existing Firebase project `holaspeak-ac16d`. Upgrade it to Blaze / link a Google Cloud billing account in the console. No billing changes are made by the repository scripts.
2. Enable Cloud Text-to-Speech API for that project: <https://console.cloud.google.com/apis/library/texttospeech.googleapis.com?project=holaspeak-ac16d>.
3. In a terminal at the repository root:

```powershell
npm.cmd ci
npm.cmd ci --prefix functions
npx.cmd firebase login
npx.cmd firebase deploy --only functions:tts --project holaspeak-ac16d
```

Complete Google login yourself. The function uses Application Default Credentials; do not download a service-account private key or put one in the frontend. If deployment reports missing permissions, grant only the reported deployment/runtime permissions. The runtime needs access to the project's Firestore data and permission to consume the enabled Google API.

4. The function uses Seoul (`asia-northeast3`), Node 22, 256 MiB, zero minimum instances, maximum one instance and concurrency 20. It has no always-running instance.
5. Check the deployed function's `/health` URL. Set `window.HOLA_TTS_API_URL` in `tts-config.js` to the returned function base URL (without `/synthesize`), for example `https://asia-northeast3-holaspeak-ac16d.cloudfunctions.net/tts`. Publish the frontend. Leave the URL blank until deployment succeeds; the UI clearly falls back to device speech.
6. Sign in on HolaSpeak, play a sentence twice, reload and play again. Use another voice/speed/pitch and confirm a different clip is created. Google fallback/device voice is identified in the profile's audio status. Requests return `X-Hola-Audio-Cache: HIT` or `MISS` for server diagnosis.

`HOLA_ENABLE_TTS` controls only example voice settings. `HOLA_ENABLE_SPEECH` remains false until Azure assessment is separately implemented and deployed.

## Pricing reference (checked 2026-11-26)

Google lists Neural2's monthly free usage as **1,000,000 characters**, with US$16 per additional million characters. Billing must still be enabled. Function execution, build artifacts, Firestore reads/writes/storage and other cloud resources are separate. The app's earlier proposed 100,000-character limit was an app setting, not Google's free tier; the prepared default is now 1,000,000.

- <https://cloud.google.com/text-to-speech/pricing>
- <https://docs.cloud.google.com/text-to-speech/docs/get-started?hl=en>
- <https://firebase.google.com/docs/functions/get-started>

## Verification

```powershell
npm.cmd test --prefix functions
```

Tests substitute the Google provider and verify Firebase token enforcement, persistent cache reuse, simultaneous request deduplication, changed-settings keys, quota exhaustion and failure recovery. They do not count as a live Google synthesis test.
