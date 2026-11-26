'use strict';
const express = require('express');
const { randomUUID } = require('node:crypto');
const { mkdirSync } = require('node:fs');
const { dirname } = require('node:path');
const { createStore } = require('./store');
const { speech, speechKey, validWav, assessment } = require('./domain');
function createApp({ store, verifyGoogle, synthesize, assess, origins, clientId } = {}) {
  const app = express(), pendingAudio = new Map();
  const allowed = new Set(origins || (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',').map(s => s.trim()));
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const origin = req.get('Origin');
    if (origin && allowed.has(origin)) {
      res.set('Access-Control-Allow-Origin', origin); res.vary('Origin');
      res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    if (req.path === '/health') return next();
    if (!origin || !allowed.has(origin)) return res.status(403).json({ error: '허용되지 않은 접속 주소예요.' });
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use(express.json({ limit: '1400kb' }));
  const loginWindows = new Map();
  app.post('/auth/google', async (req, res) => {
    if (!clientId) return res.status(503).json({ error: 'Google 로그인이 아직 설정되지 않았어요.' });
    const now = Date.now();
    for (const [ip, v] of loginWindows) if (v.until < now) loginWindows.delete(ip);
    const limit = loginWindows.get(req.ip) || { count: 0, until: now + 60000 };
    loginWindows.set(req.ip, limit);
    if (++limit.count > 20) return res.status(429).json({ error: '잠시 후 다시 로그인해 주세요.' });
    if (typeof req.body?.credential !== 'string' || req.body.credential.length > 10000) return res.sendStatus(400);
    try {
      const identity = await verifyGoogle(req.body.credential);
      if (!identity?.sub || !identity.email_verified) return res.sendStatus(401);
      res.json(store.login(identity, req.body.guest));
    } catch { res.status(401).json({ error: 'Google 인증을 확인할 수 없어요. 다시 로그인해 주세요.' }); }
  });
  app.use((req, res, next) => {
    const token = req.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
    const userId = token && store.authenticate(token);
    if (!userId) return res.status(401).json({ error: '로그인이 필요해요.' });
    req.userId = userId; req.token = token; next();
  });
  app.get('/me', (req, res) => res.json(store.user(req.userId)));
  app.post('/auth/logout', (req, res) => { store.logout(req.token); res.sendStatus(204); });
  app.put('/progress', (req, res) => {
    if (!Number.isSafeInteger(req.body?.revision) || !req.body?.progress) return res.sendStatus(400);
    if (!store.save(req.userId, req.body.progress, req.body.revision)) return res.status(409).json({ error: '다른 기기의 새 기록이 있어요. 동기화할 기록을 선택해 주세요.' });
    res.json(store.user(req.userId));
  });
  app.delete('/progress', (req, res) => res.json(store.reset(req.userId)));
  app.get('/assessments', (req, res) => res.json({ items: store.history(req.userId) }));
  app.post('/synthesize', async (req, res) => {
    let settings;
    try { settings = speech(req.body); } catch { return res.status(400).json({ error: '문장 또는 음성 설정을 확인해 주세요.' }); }
    const key = speechKey(settings);
    let audio = store.audio(key);
    if (!audio) {
      if (!store.quota(req.userId, 'tts', 200)) return res.status(429).json({ error: '오늘의 음성 생성 한도에 도달했어요.' });
      try {
        let pending = pendingAudio.get(key);
        if (!pending) { pending = Promise.resolve().then(() => synthesize(settings)).then(data => { const bytes = Buffer.from(data); if (!bytes.length || bytes.length > 2000000) throw new Error('Invalid audio'); store.putAudio(key, bytes); return bytes; }); pendingAudio.set(key, pending); }
        try { audio = await pending; } finally { if (pendingAudio.get(key) === pending) pendingAudio.delete(key); }
      } catch { return res.status(502).json({ error: '예시 음성을 생성하지 못했어요.' }); }
    }
    res.type('audio/mpeg').send(audio);
  });
  app.post('/assessments', async (req, res) => {
    let reference;
    try { reference = speech({ text: req.body?.reference }).text; } catch { return res.status(400).json({ error: '기준 문장을 확인해 주세요.' }); }
    const raw = req.body?.audio;
    if (typeof raw !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) return res.sendStatus(400);
    const wav = Buffer.from(raw, 'base64');
    if (!validWav(wav)) return res.status(400).json({ error: '0.1~30초의 16kHz 모노 PCM WAV 녹음이 필요해요.' });
    if (!store.quota(req.userId, 'assessment', 100)) return res.status(429).json({ error: '오늘의 발음 평가 한도에 도달했어요.' });
    try {
      // Always call Azure, even for identical reference/audio. No assessment cache.
      const result = assessment(await assess(reference, wav));
      if (!result) return res.status(422).json({ error: '음성을 인식하지 못했어요. 조금 더 또렷하게 다시 녹음해 주세요.' });
      res.status(201).json(store.addAssessment(randomUUID(), req.userId, reference, result));
    } catch { res.status(502).json({ error: '발음 평가를 완료하지 못했어요. 잠시 후 다시 녹음해 주세요.' }); }
  });
  app.use((error, _req, res, _next) => res.status(error.type === 'entity.too.large' ? 413 : error instanceof SyntaxError ? 400 : 500).json({ error: '요청을 처리하지 못했어요.' }));
  return app;
}
if (require.main === module) {
  const { OAuth2Client } = require('google-auth-library');
  const textToSpeech = require('@google-cloud/text-to-speech');
  const clientId = process.env.GOOGLE_CLIENT_ID, dbPath = process.env.DATABASE_PATH || './data/hola.sqlite';
  mkdirSync(dirname(dbPath), { recursive: true });
  const google = new OAuth2Client(clientId), tts = new textToSpeech.TextToSpeechClient();
  const app = createApp({ store: createStore(dbPath), clientId,
    verifyGoogle: async credential => (await google.verifyIdToken({ idToken: credential, audience: clientId })).getPayload(),
    synthesize: async s => (await tts.synthesizeSpeech({ input: { text: s.text }, voice: { languageCode: s.languageCode, name: s.voice }, audioConfig: { audioEncoding: s.audioEncoding, speakingRate: s.speakingRate, pitch: s.pitch } }, { timeout: 20000 }))[0].audioContent,
    assess: async (reference, wav) => {
      const region = process.env.AZURE_SPEECH_REGION;
      if (!/^[a-z0-9-]+$/.test(region || '') || !process.env.AZURE_SPEECH_KEY) throw new Error('Azure not configured');
      const response = await fetch(`https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=es-ES&format=detailed`, {
        method: 'POST', signal: AbortSignal.timeout(25000),
        headers: { 'Ocp-Apim-Subscription-Key': process.env.AZURE_SPEECH_KEY, 'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000', Accept: 'application/json', 'Pronunciation-Assessment': Buffer.from(JSON.stringify({ ReferenceText: reference, GradingSystem: 'HundredMark', Granularity: 'Phoneme', Dimension: 'Comprehensive', EnableMiscue: true })).toString('base64') }, body: wav,
      });
      if (!response.ok) throw new Error('Azure request failed');
      return response.json();
    },
  });
  app.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => console.log('HolaSpeak API ready'));
}
module.exports = { createApp };
