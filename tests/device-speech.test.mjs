import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = (await readFile(new URL('../src/hola-audio.js', import.meta.url), 'utf8')).replace("import { api } from './hola-client.js';", 'const api = () => { throw new Error("Unexpected API call"); };');
let instance = 0;
async function module() { return import('data:text/javascript;base64,' + Buffer.from(source + `\n// device test ${instance++}`).toString('base64')); }
function environment(voices = []) {
  const preferences = new Map(), spoken = [], messages = [];
  globalThis.window = new EventTarget(); window.HOLA_TTS_PROVIDER = 'device'; window.HOLA_TTS_API_URL = 'https://must-not-be-called.test';
  globalThis.localStorage = { getItem: key => preferences.get(key) ?? null, setItem: (key, value) => preferences.set(key, value) };
  globalThis.fetch = () => { throw new Error('Paid API must not be called'); };
  globalThis.indexedDB = { open: () => { throw new Error('Device speech needs no audio cache'); } };
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  const synth = new EventTarget();
  Object.assign(synth, { getVoices: () => voices, cancel() {}, resume() {}, speak(utterance) { spoken.push(utterance); } });
  window.speechSynthesis = synth;
  window.addEventListener('hola:audio-status', event => messages.push(event.detail));
  return { preferences, spoken, messages };
}
test('Spark speech plays Spanish directly without Firebase, paid API or MP3 cache', async () => {
  const english = { name: 'English', lang: 'en-US', voiceURI: 'en' }, spanish = { name: 'Español', lang: 'es-ES', voiceURI: 'es', localService: true };
  const env = environment([english, spanish]), audio = await module();
  await audio.say(' Hola '); await audio.say('Gracias');
  assert.equal(env.spoken.length, 2); assert.equal(env.spoken[0].text, 'Hola');
  assert.equal(env.spoken[0].voice, spanish); assert.equal(env.spoken[0].lang, 'es-ES');
  assert.equal(audio.spanishVoices().length, 1);
});
test('selected device voice, speaking speed and pitch are applied and saved', async () => {
  const voice = { name: 'Paulina', lang: 'es-MX', voiceURI: 'mexico' };
  const env = environment([voice]), audio = await module();
  audio.setVoiceSettings({ voiceURI: 'mexico', speakingRate: 0.7, pitch: 2 });
  await audio.say('Buenos días');
  assert.equal(env.spoken[0].voice, voice); assert.equal(env.spoken[0].rate, 0.7);
  assert.equal(env.spoken[0].pitch, 2 ** (2 / 12));
  assert.equal(audio.voiceSettings().voiceURI, 'mexico');
  const reloaded = await module(); assert.equal(reloaded.voiceSettings().speakingRate, 0.7);
});
test('late-loading voices use the Spanish language hint and voice errors have actionable feedback', async () => {
  const env = environment(), audio = await module();
  await audio.say('Hola'); assert.equal(env.spoken[0].lang, 'es-ES');
  env.spoken[0].onerror({ error: 'language-unavailable' });
  assert.match(env.messages.at(-1), /스페인어 음성을 추가/);
  await audio.say('Gracias');
  const before = env.messages.length; env.spoken[0].onerror({ error: 'interrupted' });
  assert.equal(env.messages.length, before);
});
test('unsupported browsers show a message and legacy Google voice preferences migrate safely', async () => {
  const env = environment(), audio = await module();
  env.preferences.set('hola-voice', JSON.stringify({ voice: 'es-ES-Neural2-A', speakingRate: 1.1, pitch: 0 }));
  assert.equal(audio.voiceSettings().voiceURI, 'auto'); assert.equal(audio.voiceSettings().speakingRate, 1.1);
  window.speechSynthesis = undefined;
  await audio.say('Hola'); assert.match(env.messages.at(-1), /지원하지/);
});
