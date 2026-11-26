import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const original = (await readFile(new URL('../src/hola-audio.js', import.meta.url), 'utf8')).replace("import { api } from './hola-client.js';", 'const api = () => { throw new Error("No speech API during recording"); };');
let sequence = 0;
async function audioModule() { return import('data:text/javascript;base64,' + Buffer.from(original + `\n// microphone ${sequence++}`).toString('base64')); }
function environment(getUserMedia, resume) {
  const events = []; let stopped = 0, closed = 0, started = 0;
  const stream = { getTracks: () => [{ stop() { stopped++; } }] };
  globalThis.window = { isSecureContext: true, speechSynthesis: { cancel() {} } };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: options => { events.push('permission'); return getUserMedia ? getUserMedia(options, stream) : Promise.resolve(stream); } } } });
  window.AudioContext = class {
    state = 'suspended';
    resume() { events.push('resume'); this.state = 'running'; return resume ? resume() : Promise.resolve(); }
    close() { closed++; this.state = 'closed'; return Promise.resolve(); }
    decodeAudioData = async () => ({ duration: 1, length: 16000, numberOfChannels: 1, sampleRate: 16000, getChannelData: () => new Float32Array(16000) });
  };
  window.MediaRecorder = class {
    state = 'inactive'; mimeType = 'audio/webm';
    start() { started++; this.state = 'recording'; }
    stop() { this.state = 'inactive'; queueMicrotask(() => { this.ondataavailable?.({ data: new Blob(['recording']) }); this.onstop?.(); }); }
  };
  return { stream, events, stopped: () => stopped, closed: () => closed, started: () => started };
}
test('microphone permission denial reports actionable help and releases the audio context', async () => {
  const env = environment(async () => { throw new DOMException('denied', 'NotAllowedError'); });
  const audio = await audioModule(), controller = new AbortController();
  await assert.rejects(audio.recordAttempt({ signal: controller.signal }), e => e.name === 'NotAllowedError');
  assert.deepEqual(env.events, ['resume', 'permission']);
  assert.equal(env.closed(), 1); assert.equal(env.started(), 0);
  assert.match(audio.microphoneError({ name: 'NotAllowedError' }), /Chrome.*사이트 설정/);
  assert.match(audio.microphoneError({ name: 'NotFoundError' }), /마이크.*찾지/);
});
test('closing during a pending permission request cancels immediately and stops a late microphone grant', async () => {
  let grant;
  const env = environment(() => new Promise(resolve => { grant = resolve; }));
  const audio = await audioModule(), controller = new AbortController();
  const attempt = audio.recordAttempt({ signal: controller.signal });
  controller.abort(); await assert.rejects(attempt, e => e.name === 'AbortError');
  assert.equal(env.closed(), 1); assert.equal(env.started(), 0);
  grant(env.stream); await new Promise(resolve => setImmediate(resolve));
  assert.equal(env.stopped(), 1);
});
test('ignored microphone prompts time out instead of leaving recording disabled forever', async t => {
  let grant;
  const env = environment(() => new Promise(resolve => { grant = resolve; }));
  const audio = await audioModule();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const attempt = audio.requestMicrophone(new AbortController().signal);
  const rejection = assert.rejects(attempt, /마이크 권한 응답/);
  t.mock.timers.tick(20000); await rejection;
  grant(env.stream); await Promise.resolve(); await Promise.resolve();
  assert.equal(env.stopped(), 1);
});
test('permission grant starts recording and emits PCM WAV; stopping releases the microphone', async () => {
  const env = environment(), audio = await audioModule();
  const bytes = await audio.recordAttempt({ signal: new AbortController().signal, onReady: stop => queueMicrotask(stop), onAutoStop() {} });
  assert.equal(env.started(), 1); assert.equal(env.stopped(), 1); assert.equal(env.closed(), 1);
  const wav = Buffer.from(bytes); assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.equal(wav.length, 32044);
});
test('cancel also releases a granted microphone while audio startup is stalled', async () => {
  const env = environment(undefined, () => new Promise(() => {})), audio = await audioModule(), controller = new AbortController();
  const attempt = audio.recordAttempt({ signal: controller.signal });
  await new Promise(resolve => setImmediate(resolve)); controller.abort();
  await assert.rejects(attempt, e => e.name === 'AbortError');
  assert.equal(env.stopped(), 1); assert.equal(env.closed(), 1); assert.equal(env.started(), 0);
});
