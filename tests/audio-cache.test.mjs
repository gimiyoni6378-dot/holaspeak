import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const original = await readFile(new URL('../src/hola-audio.js', import.meta.url), 'utf8');
let moduleNumber = 0;
async function audioModule() {
  const source = original.replace("import { api } from './hola-client.js';", 'const api = (...args) => globalThis.__audioTestApi(...args);') + `\n// instance ${moduleNumber++}`;
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
}
function environment() {
  const clips = new Map(), preferences = new Map(); let plays = 0, devicePlays = 0;
  globalThis.window = new EventTarget(); window.HOLA_TTS_PROVIDER = 'azure'; window.HOLA_TTS_API_URL = 'https://speech.test';
  globalThis.localStorage = { getItem: key => preferences.get(key) ?? null, setItem: (key, value) => preferences.set(key, value) };
  window.AudioContext = class {
    resume = async () => {};
    decodeAudioData = async data => { if (Buffer.from(data).toString() !== 'valid-mp3') throw new Error('Corrupt audio'); return { decoded: true }; };
    createBufferSource = () => ({ connect() {}, stop() {}, start() { plays++; } });
  };
  globalThis.SpeechSynthesisUtterance = class {};
  globalThis.speechSynthesis = window.speechSynthesis = { cancel() {}, speak() { devicePlays++; } };
  globalThis.indexedDB = { open: () => {
    const request = {};
    queueMicrotask(() => {
      request.result = {
        close() {}, createObjectStore() {},
        transaction() {
          const tx = { objectStore: () => ({
            get(key) { const result = {}; queueMicrotask(() => { result.result = clips.get(key); result.onsuccess?.(); }); return result; },
            put(value, key) { clips.set(key, value); }, delete(key) { clips.delete(key); },
            getAllKeys() { const result = {}; queueMicrotask(() => { result.result = [...clips.keys()]; result.onsuccess?.(); }); return result; },
          }) };
          setTimeout(() => tx.oncomplete?.(), 0); return tx;
        },
      };
      request.onsuccess?.();
    });
    return request;
  } };
  return { clips, plays: () => plays, devicePlays: () => devicePlays };
}
test('example audio survives reload and legacy voice preferences reuse the shared clip', async () => {
  const env = environment(); let calls = 0;
  globalThis.__audioTestApi = async () => { calls++; return new Blob(['valid-mp3'], { type: 'audio/mpeg' }); };
  const first = await audioModule();
  await first.say('Hola'); await first.say(' Hola ');
  assert.equal(calls, 1); assert.equal(env.clips.size, 1);
  const afterReload = await audioModule(); await afterReload.say('Hola');
  assert.equal(calls, 1);
  localStorage.setItem('hola-voice', JSON.stringify({ voice: 'es-ES-AlvaroNeural', speakingRate: 1.1, pitch: 2 }));
  const legacy = await audioModule(); await legacy.say('Hola');
  assert.equal(calls, 1); assert.equal(env.clips.size, 1); assert.equal(env.devicePlays(), 0);
});
test('invalid audio never poisons persistent cache and a later valid response recovers', async () => {
  const env = environment(); let calls = 0;
  globalThis.__audioTestApi = async () => new Blob([++calls === 1 ? 'bad-mp3' : 'valid-mp3'], { type: 'audio/mpeg' });
  const audio = await audioModule(); await audio.say('Gracias');
  assert.equal(env.clips.size, 0); assert.equal(env.devicePlays(), 0);
  await audio.say('Gracias');
  assert.equal(calls, 2); assert.equal(env.clips.size, 1); assert.equal(env.plays(), 1);
});
