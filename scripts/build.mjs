import { cp, mkdir } from 'node:fs/promises';
const root = new URL('../', import.meta.url), output = new URL('dist/', root);
await mkdir(output, { recursive: true });
// Explicit public allowlist: never copy backend data, secrets or dependencies.
for (const path of ['index.html', 'style.css', 'app.js', 'pwa.js', 'sw.js', 'manifest.webmanifest', 'tts-config.js', 'astryx-ui.js', 'astryx-css-import.js', 'src', 'assets', 'icons']) {
  await cp(new URL(path, root), new URL(path, output), { recursive: true });
}
console.log('HolaSpeak static build: dist/');
