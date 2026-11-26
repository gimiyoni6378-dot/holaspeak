import { firebaseServices } from './firebase-admin.js';
import { FirestoreSpeechStore } from './speech-store.js';
import { fail } from '../azure-worker/src/domain.js';
async function body(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw fail(415, 'JSON 요청이 필요해요.');
  const reader = request.body?.getReader();
  if (!reader) throw fail(400, '요청 내용이 없어요.');
  const chunks = []; let size = 0;
  for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 1300000) { await reader.cancel(); throw fail(413, '녹음이 너무 길어요.'); } chunks.push(value); }
  try { const value = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value; } catch { throw fail(400, '요청 내용을 확인해 주세요.'); }
}
export function createHandler({ env = process.env, services = firebaseServices, store = (db, config) => new FirestoreSpeechStore(db, config) } = {}) {
  return async request => {
    const allowed = env.ALLOWED_ORIGIN || 'https://gimiyoni6378-dot.github.io';
    const headers = { 'Access-Control-Allow-Origin': allowed, Vary: 'Origin', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Cache-Control': 'no-store' };
    const json = (value, status = 200) => Response.json(value, { status, headers });
    if (request.headers.get('Origin') !== allowed) return Response.json({ error: '허용되지 않은 사이트예요.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
    try {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      const url = new URL(request.url);
      const path = url.pathname === '/api/speech' ? `/${url.searchParams.get('action')}` : url.pathname;
      if (request.method !== 'POST' || !['/synthesize', '/assessments'].includes(path)) throw fail(404, '요청 경로를 확인해 주세요.');
      if (env.SPEECH_ENABLED !== 'true' || !/^[a-z][a-z0-9-]+$/.test(env.AZURE_SPEECH_REGION || '') || !env.AZURE_SPEECH_KEY) throw fail(503, 'Azure 음성 연결을 준비 중이에요.');
      const token = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1];
      if (!token) throw fail(401, '로그인한 뒤 이용해 주세요.');
      const { auth, db } = services(env);
      let uid;
      try { uid = (await auth.verifyIdToken(token)).uid; if (!uid) throw new Error(); }
      catch { throw fail(401, '로그인을 다시 확인해 주세요.'); }
      const input = await body(request), speech = store(db, env);
      if (path === '/synthesize') return new Response(await speech.synthesize(uid, input), { headers: { ...headers, 'Content-Type': 'audio/mpeg' } });
      return json(await speech.assess(uid, input));
    } catch (error) { return json({ error: error.status ? error.message : '음성 서버 연결 또는 무료 사용량을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.' }, error.status || 503); }
  };
}
export const handleSpeech = createHandler();
