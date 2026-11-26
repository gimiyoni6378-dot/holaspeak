import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FirestoreSpeechStore } from '../server/speech-store.js';
import { createHandler } from '../server/speech-handler.js';
import { readFile } from 'node:fs/promises';
const audioSource = (await readFile(new URL('../src/hola-audio.js', import.meta.url), 'utf8')).replace("import { api } from './hola-client.js';", 'const api = () => {};');
const { pcmWav } = await import('data:text/javascript;base64,' + Buffer.from(audioSource).toString('base64'));
// Serialize transactions like Firestore and roll back failed attempts.
function database() {
  const records = new Map(); let queue = Promise.resolve();
  return { records, doc: path => path, runTransaction(callback) {
    const task = queue.then(async () => {
      const writes = new Map(); let hasWrite = false;
      const get = ref => { assert.equal(hasWrite, false, 'all reads precede writes'); const value = records.get(ref); return { exists: value !== undefined, data: () => value }; };
      const result = await callback({ get: async ref => get(ref), getAll: async (...refs) => refs.map(get), set(ref, value) { hasWrite = true; writes.set(ref, value); } });
      for (const [key, value] of writes) records.set(key, value);
      return result;
    }); queue = task.catch(() => {}); return task;
  } };
}
const env = { AZURE_SPEECH_REGION: 'eastus', AZURE_SPEECH_KEY: 'server-secret', SPEECH_ENABLED: 'true', ALLOWED_ORIGIN: 'https://app.test' };
const wav = () => Buffer.from(pcmWav(new Float32Array(16000), 16000)).toString('base64');
test('Firestore cache survives instances and shares a durable lease across concurrent requests', async () => {
  const db = database(); let calls = 0, release;
  const upstream = async () => { calls++; await new Promise(resolve => { release = resolve; }); return new Response('valid-mp3', { headers: { 'Content-Type': 'audio/mpeg' } }); };
  const first = new FirestoreSpeechStore(db, env, upstream), second = new FirestoreSpeechStore(db, env, upstream);
  const pending = first.synthesize('alice', { text: 'Hola' });
  await new Promise(resolve => setTimeout(resolve, 0));
  await assert.rejects(second.synthesize('bob', { text: 'Hola' }), e => e.status === 409);
  assert.equal(calls, 1); release(); await pending;
  const replay = await second.synthesize('bob', { text: 'Hola' }); assert.equal(Buffer.from(replay).toString(), 'valid-mp3'); assert.equal(calls, 1);
  assert.equal([...db.records.keys()].filter(k => k.startsWith('_speechAudio/')).length, 1);
});
test('concurrent quota reservations cannot cross caps and DB failure prevents Azure requests', async () => {
  const db = database(), store = new FirestoreSpeechStore(db, env); let calls = 0;
  await store.reserve('alice', 'assessment', 299);
  const attempts = await Promise.allSettled([store.reserve('alice', 'assessment', 1), store.reserve('alice', 'assessment', 1)]);
  assert.equal(attempts.filter(a => a.status === 'fulfilled').length, 1);
  const restarted = new FirestoreSpeechStore(db, env);
  await assert.rejects(restarted.reserve('alice', 'assessment', 1), e => e.status === 429);
  // Force the shared monthly total to the exact cap; another UID is also blocked.
  for (const [key, value] of db.records) if (value.amount === 300) db.records.set(key, { ...value, amount: 18000 });
  await assert.rejects(restarted.reserve('bob', 'assessment', 1), e => e.status === 429);
  const offline = new FirestoreSpeechStore({ runTransaction: async () => { throw new Error('quota unavailable'); }, doc: p => p }, env, async () => { calls++; });
  await assert.rejects(offline.assess('bob', { reference: 'Hola', audio: wav() })); assert.equal(calls, 0);
});
test('identical recordings are always reassessed; only counters persist and failures remain charged', async () => {
  const db = database(); let calls = 0;
  const store = new FirestoreSpeechStore(db, env, async (_url, init) => {
    calls++; const config = JSON.parse(Buffer.from(init.headers['Pronunciation-Assessment'], 'base64').toString());
    assert.equal(config.ReferenceText, 'Hola'); assert.equal(config.EnableProsodyAssessment, undefined);
    return Response.json({ RecognitionStatus: 'Success', NBest: [{ PronScore: 80, AccuracyScore: 75, FluencyScore: 90, CompletenessScore: 100, Words: [] }] });
  });
  const a = await store.assess('alice', { reference: 'Hola', audio: wav() }), b = await store.assess('alice', { reference: 'Hola', audio: wav() });
  assert.notEqual(a.id, b.id); assert.equal(calls, 2); assert.equal(a.result.pronunciation, 80);
  assert.ok([...db.records.keys()].every(key => key.startsWith('_speechUsage/')));
  const failing = new FirestoreSpeechStore(db, env, async () => { throw new Error('timeout'); });
  await assert.rejects(failing.assess('alice', { reference: 'Hola', audio: wav() }), e => e.status === 503);
  assert.ok([...db.records.values()].every(value => value.amount === 3));
});
test('Vercel route checks token, origin, readiness and payload without exposing secrets', async () => {
  let uid, calls = 0;
  const deps = { env, services: () => ({ db: {}, auth: { verifyIdToken: async token => { if (token !== 'valid') throw new Error('token rejected'); return { uid: 'verified-alice' }; } } }), store: () => ({ assess: async (owner, input) => { calls++; uid = owner; assert.equal(input.uid, 'spoofed'); return { id: 'new' }; } }) };
  const handler = createHandler(deps);
  const req = (token = 'valid', origin = env.ALLOWED_ORIGIN, path = '/assessments') => new Request('https://server.test' + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ uid: 'spoofed' }) });
  assert.equal((await handler(req('bad'))).status, 401); assert.equal((await handler(req(''))).status, 401);
  assert.equal((await handler(req('valid', 'https://evil.test'))).status, 403); assert.equal(calls, 0);
  assert.equal((await handler(req())).status, 200); assert.equal(uid, 'verified-alice');
  assert.equal((await handler(req('valid', env.ALLOWED_ORIGIN, '/api/speech?action=assessments'))).status, 200);
  assert.equal((await createHandler({ ...deps, env: { ...env, SPEECH_ENABLED: 'false' } })(req())).status, 503);
  const broken = createHandler({ ...deps, services: () => { throw new Error('PRIVATE KEY server-secret'); } });
  const failure = await broken(req()); assert.equal(failure.status, 503); assert.doesNotMatch(await failure.text(), /PRIVATE KEY|server-secret/);
});
