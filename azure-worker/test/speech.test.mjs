import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { SpeechStore, gateway } from '../src/index.js';
import { settings, ssml, wav, LIMITS, quotaKeys } from '../src/domain.js';
import { verifyUser } from '../src/auth.js';
function environment() {
  const db = new DatabaseSync(':memory:');
  // Cloudflare accepts ArrayBuffer BLOB bindings; Node 22 SQLite needs a view.
  const sql = { exec(query, ...params) {
    const rows = db.prepare(query).all(...params.map(p => p instanceof ArrayBuffer ? new Uint8Array(p) : p));
    return { toArray: () => rows };
  } };
  const ctx = { storage: { sql, transactionSync(fn) { db.exec('BEGIN'); try { const result = fn(); db.exec('COMMIT'); return result; } catch (e) { db.exec('ROLLBACK'); throw e; } } } };
  const env = { AZURE_SPEECH_KEY: 'test-server-key', AZURE_SPEECH_REGION: 'eastus', SPEECH_ENABLED: 'true', ALLOWED_ORIGIN: 'https://app.test' };
  return { store: new SpeechStore(ctx, env), db, env };
}
function audio() {
  const b = Buffer.alloc(32044); b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(b.length - 44, 40); return b.toString('base64');
}
test('validates settings, escapes SSML, rejects malformed or oversized recordings', () => {
  const s = settings({ text: 'Hola <amigo> & tú' });
  assert.match(ssml(s), /&lt;amigo&gt; &amp; tú/);
  assert.throws(() => settings({ text: 'Hola', voice: 'untrusted"' }), e => e.status === 400);
  assert.throws(() => settings({ text: 'Hola', pitch: 100 }), e => e.status === 400);
  assert.equal(wav(audio()).seconds, 1);
  assert.throws(() => wav('bad-data'), e => e.status === 400);
  assert.throws(() => wav(Buffer.alloc(960046).toString('base64')), e => e.status === 400);
});
test('example audio shares concurrent generation and persists across object restart; settings separate cache', async t => {
  const { store, db, env } = environment(); t.after(() => db.close()); let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    calls++; assert.equal(init.headers['Ocp-Apim-Subscription-Key'], 'test-server-key');
    await new Promise(resolve => setTimeout(resolve, 5));
    return new Response('mock-mp3', { headers: { 'Content-Type': 'audio/mpeg' } });
  });
  await Promise.all([store.synthesize('alice', { text: 'Hola' }), store.synthesize('bob', { text: 'Hola' })]);
  const restart = new SpeechStore(store.ctx, env);
  await restart.synthesize('bob', { text: 'Hola' }); assert.equal(calls, 1);
  await restart.synthesize('alice', { text: 'Hola', speakingRate: 0.7 });
  await restart.synthesize('alice', { text: 'Hola', pitch: 2 });
  await restart.synthesize('alice', { text: 'Hola', voice: 'es-ES-AlvaroNeural' });
  assert.equal(calls, 4); assert.equal(db.prepare('SELECT count(*) n FROM clips').get().n, 4);
});
test('atomic quotas deny at the exact cap, persist after restart and leave cached audio available', async t => {
  const { store, db, env } = environment(); t.after(() => db.close());
  store.reserve('alice', 'tts', 5000); assert.throws(() => store.reserve('alice', 'tts', 1), e => e.status === 429);
  const key = quotaKeys('bob', 'tts')[0].key;
  db.prepare('UPDATE quota SET amount = ? WHERE key = ?').run(LIMITS.tts, key);
  const restart = new SpeechStore(store.ctx, env);
  assert.throws(() => restart.reserve('bob', 'tts', 1), e => e.status === 429);
  assert.equal(db.prepare('SELECT amount FROM quota WHERE key = ?').get(key).amount, LIMITS.tts);
  const canonical = JSON.stringify(settings({ text: 'Hola' }));
  db.prepare('INSERT INTO clips VALUES (?, ?, ?)').run(canonical, new Uint8Array([1, 2]), Date.now());
  t.mock.method(globalThis, 'fetch', () => { throw new Error('quota must prevent network'); });
  assert.equal((await restart.synthesize('bob', { text: 'Hola' })).byteLength, 2);
  await assert.rejects(restart.synthesize('bob', { text: 'Gracias' }), e => e.status === 429);
});
test('identical recordings always make new Azure assessments with unique IDs and no persisted audio/results', async t => {
  const { store, db } = environment(); t.after(() => db.close()); let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls++; assert.match(url, /stt.speech.microsoft.com/); assert.equal(init.body.byteLength, 32044);
    const header = JSON.parse(Buffer.from(init.headers['Pronunciation-Assessment'], 'base64').toString());
    assert.equal(header.ReferenceText, 'Hola'); assert.equal(header.EnableProsodyAssessment, undefined);
    return Response.json({ RecognitionStatus: 'Success', NBest: [{ AccuracyScore: 80, FluencyScore: 90, CompletenessScore: 100, PronScore: 85, Words: [{ Word: 'Hola', AccuracyScore: 80, ErrorType: 'None' }] }] });
  });
  const input = { reference: 'Hola', audio: audio() };
  const a = await store.assess('alice', input), b = await store.assess('alice', input);
  assert.equal(calls, 2); assert.notEqual(a.id, b.id); assert.equal(a.result.pronunciation, 85);
  assert.equal(db.prepare('SELECT count(*) n FROM clips').get().n, 0);
  assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name), ['clips', 'quota']);
});
test('failed Azure requests consume reservations to avoid undercounting after a timeout', async t => {
  const { store, db } = environment(); t.after(() => db.close());
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('timeout'); });
  await assert.rejects(store.assess('alice', { reference: 'Hola', audio: audio() }), e => e.status === 503);
  assert.equal(db.prepare('SELECT amount FROM quota WHERE key = ?').get(quotaKeys('alice', 'assessment')[0].key).amount, 1);
});
test('gateway checks origin and login, overwrites spoofed UID, and remains disabled before setup', async () => {
  let envelope, verified = 0;
  const env = { SPEECH_ENABLED: 'true', AZURE_SPEECH_REGION: 'eastus', AZURE_SPEECH_KEY: 'key', ALLOWED_ORIGIN: 'https://app.test', SPEECH: { idFromName: s => s, get: () => ({ fetch: async req => { envelope = await req.json(); return Response.json({ ok: true }); } }) } };
  const app = gateway(async req => { verified++; if (!req.headers.has('Authorization')) throw Object.assign(new Error('login'), { status: 401 }); return 'verified-alice'; });
  const request = (origin = 'https://app.test', auth = true) => new Request('https://worker.test/synthesize', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer token' } : {}) }, body: JSON.stringify({ text: 'Hola', uid: 'spoofed-bob' }) });
  assert.equal((await app.fetch(request('https://evil.test'), env)).status, 403); assert.equal(verified, 0);
  assert.equal((await app.fetch(request(undefined, false), env)).status, 401);
  const response = await app.fetch(request(), env); assert.equal(response.status, 200); assert.equal(envelope.uid, 'verified-alice');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), env.ALLOWED_ORIGIN);
  assert.equal((await app.fetch(request(), { ...env, SPEECH_ENABLED: 'false' })).status, 503);
  await assert.rejects(verifyUser(new Request('https://worker.test'), {}), e => e.status === 401);
  await assert.rejects(verifyUser(new Request('https://worker.test', { headers: { Authorization: 'Bearer fake' } }), { FIREBASE_PROJECT_ID: 'test' }), e => e.status === 401);
});
