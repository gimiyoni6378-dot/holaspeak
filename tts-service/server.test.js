'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./server');
const { createStore } = require('./store');
const { speech, speechKey, assessment, validWav } = require('./domain');
function wav() {
  const w = Buffer.alloc(6444); w.write('RIFF'); w.writeUInt32LE(w.length - 8, 4); w.write('WAVEfmt ', 8); w.writeUInt32LE(16, 16); w.writeUInt16LE(1, 20); w.writeUInt16LE(1, 22); w.writeUInt32LE(16000, 24); w.writeUInt32LE(32000, 28); w.writeUInt16LE(2, 32); w.writeUInt16LE(16, 34); w.write('data', 36); w.writeUInt32LE(w.length - 44, 40); return w;
}
const azure = { RecognitionStatus: 'Success', NBest: [{ AccuracyScore: 91, FluencyScore: 82, CompletenessScore: 100, PronScore: 89, Words: [{ Word: 'Hola', AccuracyScore: 91, ErrorType: 'None' }] }] };
test('speech keys canonicalize text and vary all configurable audio settings', () => {
  const key = input => speechKey(speech(input));
  assert.equal(key({ text: ' Cafe\u0301 ' }), key({ text: 'Café' }));
  const base = key({ text: 'Hola' });
  for (const setting of [{ voice: 'es-ES-Neural2-E' }, { speakingRate: 1.1 }, { pitch: 2 }, { text: 'Gracias' }]) assert.notEqual(base, key({ text: 'Hola', ...setting }));
  assert.throws(() => speech({ text: 'Hola', voice: 'invalid' }));
  assert.throws(() => speech({ text: 'Hola', speakingRate: NaN }));
  assert.throws(() => speech({ text: 'Hola', audioEncoding: 'WAV' }));
});
test('validates canonical WAV and actual Azure REST assessment response', () => {
  assert.equal(validWav(wav()), true);
  const bad = wav(); bad.writeUInt32LE(48000, 24); assert.equal(validWav(bad), false);
  assert.equal(validWav(Buffer.from('webm')), false);
  assert.equal(assessment(azure).pronunciation, 89);
  assert.equal(assessment({ RecognitionStatus: 'NoMatch' }), null);
  assert.equal(assessment({ RecognitionStatus: 'Success', NBest: [{}] }), null);
});
test('API isolates users, rejects stale progress, caches only TTS and evaluates every attempt', async t => {
  const store = createStore(':memory:'); let synthesisCalls = 0, assessmentCalls = 0;
  const app = createApp({ store, origins: ['http://localhost:5173'], clientId: 'test-client',
    verifyGoogle: async token => { if (token === 'bad') throw new Error('bad'); return { sub: token, name: token, email_verified: true }; },
    synthesize: async () => { synthesisCalls++; return Buffer.from('mp3-content'); },
    assess: async () => { assessmentCalls++; return azure; },
  });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); store.db.close(); });
  const url = `http://127.0.0.1:${server.address().port}`;
  async function call(path, method = 'GET', body, token, origin = 'http://localhost:5173') {
    return fetch(url + path, { method, headers: { Origin: origin, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  }
  assert.equal((await call('/auth/google', 'POST', { credential: 'bad' })).status, 401);
  assert.equal((await call('/me')).status, 401);
  assert.equal((await call('/auth/google', 'POST', { credential: 'a' }, null, 'https://evil.example')).status, 403);
  const a = await (await call('/auth/google', 'POST', { credential: 'a', guest: { xp: 20 } })).json();
  const b = await (await call('/auth/google', 'POST', { credential: 'b' })).json();
  assert.equal(a.progress.xp, 20); assert.equal(b.progress.xp, 0);
  assert.equal((await (await call('/auth/google', 'POST', { credential: 'a', guest: { xp: 999 } })).json()).progress.xp, 20);
  assert.equal((await call('/progress', 'PUT', { progress: { xp: 40 }, revision: 0 }, a.token)).status, 200);
  assert.equal((await call('/progress', 'PUT', { progress: { xp: 1 }, revision: 0 }, a.token)).status, 409);
  assert.equal((await (await call('/me', 'GET', null, b.token)).json()).progress.xp, 0);
  for (let i = 0; i < 2; i++) assert.equal((await call('/synthesize', 'POST', { text: 'Hola' }, a.token)).status, 200);
  assert.equal(synthesisCalls, 1);
  await call('/synthesize', 'POST', { text: 'Hola', pitch: 2 }, a.token); assert.equal(synthesisCalls, 2);
  const payload = { reference: 'Hola', audio: wav().toString('base64') };
  const first = await call('/assessments', 'POST', payload, a.token); assert.equal(first.status, 201); assert.equal(first.headers.get('cache-control'), 'no-store');
  const one = await first.json(); const two = await (await call('/assessments', 'POST', payload, a.token)).json();
  assert.equal(assessmentCalls, 2); assert.notEqual(one.id, two.id);
  assert.equal((await (await call('/assessments', 'GET', null, a.token)).json()).items.length, 2);
  assert.equal((await (await call('/assessments', 'GET', null, b.token)).json()).items.length, 0);
  assert.equal((await call('/assessments', 'POST', { reference: 'Hola', audio: 'd2VibQ==' }, a.token)).status, 400);
  await call('/progress', 'DELETE', null, a.token);
  assert.equal((await (await call('/assessments', 'GET', null, a.token)).json()).items.length, 0);
  assert.equal((await (await call('/me', 'GET', null, a.token)).json()).progress.xp, 0);
  await call('/auth/logout', 'POST', null, a.token);
  assert.equal((await call('/me', 'GET', null, a.token)).status, 401);
});
