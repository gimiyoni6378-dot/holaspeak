'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createVoiceApp } = require('../app');
const { settings, audioKey } = require('../speech');
test('audio keys normalize text and include voice, speed and pitch', () => {
  const key = input => audioKey(settings(input));
  assert.equal(key({ text: ' Cafe\u0301 ' }), key({ text: 'Café' }));
  for (const value of [{ voice: 'es-ES-Neural2-E' }, { speakingRate: 1.1 }, { pitch: 2 }]) assert.notEqual(key({ text: 'Hola' }), key({ text: 'Hola', ...value }));
  assert.throws(() => settings({ text: 'Hola', languageCode: 'en-US' }));
  assert.throws(() => settings({ text: 'Hola', speakingRate: NaN }));
  assert.throws(() => settings({ text: 'Hola', audioEncoding: 'WAV' }));
});
test('Firebase-authenticated TTS persists reusable audio, deduplicates requests and enforces quota', async t => {
  const clips = new Map(); let generationCalls = 0, reservations = 0, allowed = true, fail = false;
  const store = { getAudio: async key => clips.get(key), putAudio: async (key, data) => clips.set(key, data), reserveUsage: async () => { reservations++; return allowed; } };
  const dependencies = { store, allowedOrigins: ['https://hola.test'], verifyToken: async token => { if (token !== 'firebase-token') throw new Error('Invalid token'); return { uid: 'firebase-user' }; }, synthesize: async () => { generationCalls++; await new Promise(r => setTimeout(r, 5)); if (fail) throw new Error('Google unavailable'); return Buffer.from('valid-mp3'); } };
  const servers = [];
  t.after(() => { for (const server of servers) { server.closeAllConnections(); server.close(); } });
  async function launch() { const server = createVoiceApp(dependencies).listen(0, '127.0.0.1'); servers.push(server); await new Promise(r => server.once('listening', r)); return `http://127.0.0.1:${server.address().port}`; }
  const url = await launch();
  const request = (body, { token = 'firebase-token', origin = 'https://hola.test', base = url } = {}) => fetch(base + '/synthesize', { method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await request({ text: 'Hola' }, { token: 'wrong' })).status, 401);
  assert.equal((await request({ text: 'Hola' }, { origin: 'https://evil.test' })).status, 403);
  assert.equal(generationCalls, 0);
  const pair = await Promise.all([request({ text: 'Hola' }), request({ text: 'Hola' })]);
  assert.equal(pair[0].status, 200); assert.equal(pair[1].status, 200);
  assert.equal(generationCalls, 1); assert.equal(reservations, 1);
  assert.equal(pair[0].headers.get('cache-control'), 'no-store');
  const restarted = await launch();
  const cached = await request({ text: 'Hola' }, { base: restarted });
  assert.equal(cached.headers.get('x-hola-audio-cache'), 'HIT'); assert.equal(generationCalls, 1);
  assert.equal((await request({ text: 'Hola', pitch: 2 })).status, 200); assert.equal(generationCalls, 2);
  allowed = false;
  assert.equal((await request({ text: 'Gracias' })).status, 429); assert.equal(generationCalls, 2);
  assert.equal((await request({ text: 'Hola' })).status, 200); // Cached audio stays available at the quota.
  allowed = true; fail = true;
  assert.equal((await request({ text: 'Gracias' })).status, 502);
  fail = false;
  assert.equal((await request({ text: 'Gracias' })).status, 200); assert.equal(generationCalls, 4);
});
