import { verifyUser } from './auth.js';
import { settings, ssml, wav, assessment, quotaKeys, fail } from './domain.js';
const json = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
const errorResponse = e => json({ error: e.status ? e.message : '음성 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.' }, e.status || 503);
async function readBody(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw fail(415, 'JSON 요청이 필요해요.');
  const reader = request.body?.getReader();
  if (!reader) throw fail(400, '요청 내용이 없어요.');
  const chunks = []; let size = 0;
  for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 1300000) { await reader.cancel(); throw fail(413, '녹음이 너무 길어요.'); } chunks.push(value); }
  const all = new Uint8Array(size); let at = 0; for (const chunk of chunks) { all.set(chunk, at); at += chunk.length; }
  try { const value = JSON.parse(new TextDecoder().decode(all)); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value; } catch { throw fail(400, '요청 내용을 확인해 주세요.'); }
}
export function gateway(verify = verifyUser) {
  return { async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const cors = { 'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN, 'Vary': 'Origin', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '600', 'Cache-Control': 'no-store' };
    if (origin !== env.ALLOWED_ORIGIN) return json({ error: '허용되지 않은 사이트예요.' }, 403);
    let response;
    try {
      if (request.method === 'OPTIONS') response = new Response(null, { status: 204 });
      else {
        const path = new URL(request.url).pathname;
        if (!['/synthesize', '/assessments'].includes(path) || request.method !== 'POST') throw fail(404, '요청 경로를 확인해 주세요.');
        if (env.SPEECH_ENABLED !== 'true' || !/^[a-z][a-z0-9-]+$/.test(env.AZURE_SPEECH_REGION || '') || !env.AZURE_SPEECH_KEY) throw fail(503, 'Azure 음성 연결을 준비 중이에요.');
        const uid = await verify(request, env), body = await readBody(request);
        const stub = env.SPEECH.get(env.SPEECH.idFromName('shared-free-quota-v1'));
        // Only this authenticated Worker can access the unexposed Durable Object.
        response = await stub.fetch(new Request(`https://speech.internal${path}`, { method: 'POST', body: JSON.stringify({ uid, body }) }));
      }
    } catch (e) { response = errorResponse(e); }
    const headers = new Headers(response.headers); for (const [key, value] of Object.entries(cors)) headers.set(key, value);
    return new Response(response.body, { status: response.status, headers });
  } };
}
export default gateway();

export class SpeechStore {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env; this.sql = ctx.storage.sql; this.pending = new Map();
    this.sql.exec('CREATE TABLE IF NOT EXISTS quota (key TEXT PRIMARY KEY, amount INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS clips (key TEXT PRIMARY KEY, audio BLOB NOT NULL, created INTEGER NOT NULL)');
  }
  reserve(uid, kind, amount) {
    this.ctx.storage.transactionSync(() => {
      const limits = quotaKeys(uid, kind);
      for (const { key, limit } of limits) {
        const used = this.sql.exec('SELECT amount FROM quota WHERE key = ?', key).toArray()[0]?.amount || 0;
        if (used + amount > limit) throw fail(429, '음성 무료 사용 한도에 도달했어요. 저장된 예시 음성은 계속 들을 수 있어요.');
      }
      for (const { key } of limits) this.sql.exec('INSERT INTO quota(key, amount) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET amount = amount + excluded.amount', key, amount);
      // Keep current month only; counters survive restarts and redeployments.
      this.sql.exec('DELETE FROM quota WHERE key < ?', new Date().toISOString().slice(0, 7));
    });
  }
  async azure(url, init) {
    let response;
    try { response = await fetch(url, { ...init, signal: AbortSignal.timeout(25000) }); } catch { throw fail(503, 'Azure 응답을 받지 못했어요. 잠시 후 다시 시도해 주세요.'); }
    if (!response.ok) throw fail(response.status === 429 ? 429 : 502, response.status === 429 ? 'Azure 무료 사용 한도 또는 요청 제한에 도달했어요. 잠시 후 다시 시도해 주세요.' : 'Azure 음성 설정을 확인해 주세요.');
    return response;
  }
  async synthesize(uid, input) {
    const s = settings(input), key = JSON.stringify(s);
    const cached = this.sql.exec('SELECT audio FROM clips WHERE key = ?', key).toArray()[0];
    if (cached) return cached.audio;
    if (this.pending.has(key)) return this.pending.get(key);
    const task = (async () => {
      // SSML billable count includes voice/prosody values; conservatively reserve
      // the whole serialized request, so the app stops before the F0 allowance.
      const markup = ssml(s); this.reserve(uid, 'tts', markup.length);
      const response = await this.azure(`https://${this.env.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, { method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': this.env.AZURE_SPEECH_KEY, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-16khz-32kbitrate-mono-mp3' }, body: markup });
      const audio = await response.arrayBuffer();
      if (!audio.byteLength || audio.byteLength > 650000 || !response.headers.get('Content-Type')?.includes('audio')) throw fail(502, '예시 음성을 읽지 못했어요.');
      this.ctx.storage.transactionSync(() => {
        this.sql.exec('INSERT OR REPLACE INTO clips(key, audio, created) VALUES (?, ?, ?)', key, audio, Date.now());
        this.sql.exec('DELETE FROM clips WHERE key IN (SELECT key FROM clips ORDER BY created DESC, key DESC LIMIT -1 OFFSET 500)');
      });
      return audio;
    })();
    this.pending.set(key, task);
    try { return await task; } finally { this.pending.delete(key); }
  }
  async assess(uid, input) {
    const reference = settings({ text: input.reference }).text, { bytes, seconds } = wav(input.audio);
    this.reserve(uid, 'assessment', seconds);
    const config = { ReferenceText: reference, GradingSystem: 'HundredMark', Granularity: 'Phoneme', Dimension: 'Comprehensive', EnableMiscue: true };
    const header = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(config))));
    const response = await this.azure(`https://${this.env.AZURE_SPEECH_REGION}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=es-ES&format=detailed`, { method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': this.env.AZURE_SPEECH_KEY, 'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000', 'Pronunciation-Assessment': header }, body: bytes });
    // Never persist recordings or assessment responses here. Each call is fresh.
    return { id: crypto.randomUUID(), reference, created: Date.now(), result: assessment(await response.json()) };
  }
  async fetch(request) {
    try {
      const { uid, body } = await request.json();
      if (new URL(request.url).pathname === '/synthesize') return new Response(await this.synthesize(uid, body), { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } });
      return json(await this.assess(uid, body));
    } catch (e) { return errorResponse(e); }
  }
}
