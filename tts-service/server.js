'use strict';

const express = require('express');
const textToSpeech = require('@google-cloud/text-to-speech');

const app = express();
const client = new textToSpeech.TextToSpeechClient();
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || 'https://gimiyoni6378-dot.github.io')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);
const voices = new Set([
  'es-ES-Neural2-A',
  'es-ES-Neural2-E',
  'es-ES-Neural2-H',
]);

app.disable('x-powered-by');
app.use(express.json({ limit: '4kb', type: 'application/json' }));

app.use((req, res, next) => {
  const origin = req.get('Origin');
  if (origin && allowedOrigins.has(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') {
    return origin && allowedOrigins.has(origin)
      ? res.sendStatus(204)
      : res.sendStatus(403);
  }
  if (req.path === '/health') return next();
  if (!origin || !allowedOrigins.has(origin)) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  return next();
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/synthesize', async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  const voice = voices.has(req.body?.voice) ? req.body.voice : 'es-ES-Neural2-A';

  if (!text || [...text].length > 240) {
    return res.status(400).json({ error: 'Text must contain 1–240 characters.' });
  }

  try {
    const [result] = await client.synthesizeSpeech({
      input: { text },
      voice: { languageCode: 'es-ES', name: voice },
      audioConfig: { audioEncoding: 'MP3', speakingRate: 0.9 },
    });
    res.set('Cache-Control', 'no-store');
    res.type('audio/mpeg').send(Buffer.from(result.audioContent));
  } catch (error) {
    console.error('Cloud TTS synthesis failed:', error.message);
    res.status(502).json({ error: 'Speech generation is temporarily unavailable.' });
  }
});

app.use((error, _req, res, _next) => {
  if (error?.type === 'entity.too.large' || error instanceof SyntaxError) {
    return res.status(400).json({ error: 'Invalid request.' });
  }
  console.error('Unhandled TTS service error:', error.message);
  return res.status(500).json({ error: 'Speech generation is temporarily unavailable.' });
});

const port = Number(process.env.PORT || 8080);
app.listen(port, '0.0.0.0', () => console.log(`HolaSpeak TTS listening on ${port}`));
