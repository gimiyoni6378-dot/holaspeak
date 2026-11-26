'use strict';
const express = require('express');
const { settings, audioKey } = require('./speech');
function createVoiceApp({ verifyToken, store, synthesize, allowedOrigins = ['https://gimiyoni6378-dot.github.io'] }) {
  const app = express(), pending = new Map(), origins = new Set(allowedOrigins);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const origin = req.get('Origin');
    if (origin && origins.has(origin)) {
      res.set('Access-Control-Allow-Origin', origin); res.vary('Origin');
      res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.set('Access-Control-Expose-Headers', 'X-Hola-Audio-Cache');
    }
    if (req.path === '/health') return next();
    if (!origin || !origins.has(origin)) return res.status(403).json({ error: '허용되지 않은 사이트예요.' });
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.get('/health', (_req, res) => res.json({ ok: true, service: 'holaspeak-tts' }));
  app.use(express.json({ limit: '4kb' }));
  app.post('/synthesize', async (req, res) => {
    const token = req.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_.-]+)$/)?.[1];
    if (!token || token.length > 8192) return res.status(401).json({ error: '로그인한 뒤 예시 음성을 생성할 수 있어요.' });
    let user;
    try { user = await verifyToken(token); if (!user?.uid) throw new Error('Missing user'); }
    catch { return res.status(401).json({ error: '로그인을 확인할 수 없어요. 다시 로그인해 주세요.' }); }
    let value;
    try { value = settings(req.body); } catch { return res.status(400).json({ error: '문장과 음성 설정을 확인해 주세요.' }); }
    const key = audioKey(value);
    try {
      let task = pending.get(key);
      if (!task) {
        task = (async () => {
          const cached = await store.getAudio(key);
          if (cached) return { audio: cached, cache: 'HIT' };
          if (!await store.reserveUsage(user.uid, [...value.text].length)) throw Object.assign(new Error('Usage limit'), { status: 429 });
          const data = await synthesize(value);
          const audio = typeof data === 'string' ? Buffer.from(data, 'base64') : Buffer.from(data || []);
          if (!audio.length || audio.length > 650000) throw new Error('Invalid synthesized audio');
          await store.putAudio(key, audio);
          return { audio, cache: 'MISS' };
        })();
        pending.set(key, task);
      }
      let result;
      try { result = await task; } finally { if (pending.get(key) === task) pending.delete(key); }
      res.set('X-Hola-Audio-Cache', result.cache); res.type('audio/mpeg').send(result.audio);
    } catch (error) {
      const status = error.status === 429 ? 429 : 502;
      res.status(status).json({ error: status === 429 ? '음성 생성 한도에 도달했어요. 저장된 음성이나 기기 음성으로 연습해 주세요.' : 'Google 음성을 생성하지 못했어요. 잠시 후 다시 시도해 주세요.' });
    }
  });
  app.use((error, _req, res, _next) => res.status(error.type === 'entity.too.large' ? 413 : error instanceof SyntaxError ? 400 : 500).json({ error: '음성 요청을 처리하지 못했어요.' }));
  return app;
}
module.exports = { createVoiceApp };
