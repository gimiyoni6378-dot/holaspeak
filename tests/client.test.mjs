import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const originalSource = await readFile(new URL('../src/hola-client.js', import.meta.url), 'utf8');
const source = originalSource.replace(/^import .*firebase-backend.js';/m, 'const isFirebase = () => false, resendVerification = () => {}, resetPassword = () => {};').replace("'./progression.js'", JSON.stringify(new URL('../src/progression.js', import.meta.url).href));
function storage() { const data = new Map(); return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) }; }
test('guest migration, account separation, offline retry and explicit conflict resolution', async () => {
  globalThis.window = new EventTarget(); window.HOLA_API_URL = 'https://api.test'; window.HOLA_GOOGLE_CLIENT_ID = 'client';
  globalThis.localStorage = storage(); globalThis.sessionStorage = storage();
  let active = 'a', revision = 0, remote = { xp: 20 }, online = true, conflictNext = false;
  globalThis.fetch = async (url, init) => {
    if (!online) throw new TypeError('offline');
    const body = init.body ? JSON.parse(init.body) : null;
    const respond = (data, status = 200) => new Response(status === 204 ? null : JSON.stringify(data), { status });
    if (url.endsWith('/auth/google')) { active = body.credential; return respond({ token: active.repeat(43), user: { id: active, name: active }, progress: active === 'a' ? body.guest : { xp: 0 }, revision }); }
    if (url.endsWith('/auth/logout')) return respond(null, 204);
    if (init.method === 'PUT') {
      if (conflictNext) { conflictNext = false; return respond({ error: 'conflict' }, 409); }
      assert.equal(body.revision, revision); remote = body.progress; revision++;
      return respond({ progress: remote, revision });
    }
    return respond({ progress: remote, revision, user: { id: active } });
  };
  const client = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  assert.throws(() => client.checkIn(), /로그인/);
  client.saveProgress({ xp: 20 }); await client.login('a');
  assert.equal(client.loadProgress().xp, 20); assert.equal(JSON.parse(localStorage.getItem('hola')).xp, undefined);
  online = false; client.saveProgress({ xp: 30 }); await new Promise(resolve => setTimeout(resolve, 0));
  assert.match(client.getStatus().syncError, /offline/); assert.equal(client.loadProgress().xp, 30);
  online = true; await client.sync(); assert.equal(remote.xp, 30);
  conflictNext = true; client.saveProgress({ xp: 40 }); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(client.getStatus().conflict, true); remote = { xp: 99 }; revision++;
  await client.resolveConflict(false); assert.equal(client.loadProgress().xp, 99);
  await client.logout(); assert.equal(client.getSession(), null); assert.equal(client.loadProgress().xp, undefined);
  await client.login('b'); assert.equal(client.loadProgress().xp, 0);
  assert.equal(JSON.parse(localStorage.getItem('hola-user:a')).progress.xp, 99);
  client.checkIn(); await new Promise(resolve => setTimeout(resolve, 0));
  client.checkIn(); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(client.loadProgress().attendanceDates.length, 1);
  assert.equal(JSON.parse(localStorage.getItem('hola-user:a')).progress.attendanceDates, undefined);
});
test('PCM conversion emits canonical 16kHz mono WAV from mobile sample rates', async () => {
  globalThis.window = new EventTarget();
  const original = await readFile(new URL('../src/hola-audio.js', import.meta.url), 'utf8');
  const audio = await import('data:text/javascript;base64,' + Buffer.from(original.replace("import { api } from './hola-client.js';", 'const api = () => {};')).toString('base64'));
  const samples = Float32Array.from({ length: 48000 }, (_, i) => Math.sin(i / 10) * 0.8);
  const wav = Buffer.from(audio.pcmWav(samples, 48000));
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.equal(wav.readUInt32LE(24), 16000); assert.equal(wav.length, 32044);
  assert.equal(wav.readUInt16LE(22), 1); assert.equal(wav.readUInt16LE(34), 16);
});
test('speech requests use a current Firebase token and the dedicated TTS endpoint', async () => {
  globalThis.window = new EventTarget(); window.HOLA_TTS_API_URL = 'https://voice.test/tts';
  globalThis.localStorage = storage(); globalThis.sessionStorage = storage();
  sessionStorage.setItem('hola-session', JSON.stringify({ token: 'expired-token', user: { id: 'firebase-user' } }));
  let request;
  globalThis.fetch = async (url, init) => { request = { url, init }; return new Response('mp3', { headers: { 'Content-Type': 'audio/mpeg' } }); };
  const firebaseSource = originalSource.replace(/^import .*firebase-backend.js';/m, "const isFirebase = () => true, isConfigured = () => true, resendVerification = () => {}, resetPassword = () => {}, firebaseIdToken = async uid => { if(uid !== 'firebase-user') throw new Error('wrong user'); return 'renewed-token'; };").replace("'./progression.js'", JSON.stringify(new URL('../src/progression.js', import.meta.url).href));
  const client = await import('data:text/javascript;base64,' + Buffer.from(firebaseSource).toString('base64'));
  await client.api('/synthesize', { method: 'POST', body: { text: 'Hola' }, binary: true });
  assert.equal(request.url, 'https://voice.test/tts/synthesize');
  assert.equal(request.init.headers.Authorization, 'Bearer renewed-token');
  assert.equal(request.init.cache, 'no-store');
});
