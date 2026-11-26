'use strict';
const { onRequest } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { TextToSpeechClient } = require('@google-cloud/text-to-speech');
const { createVoiceStore } = require('./store');
const { createVoiceApp } = require('./app');
initializeApp();
const tts = new TextToSpeechClient();
const app = createVoiceApp({
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'https://gimiyoni6378-dot.github.io').split(',').map(s => s.trim()).filter(Boolean),
  verifyToken: token => getAuth().verifyIdToken(token),
  store: createVoiceStore(getFirestore(), { monthlyCharacterLimit: Number(process.env.TTS_MONTHLY_CHARACTER_LIMIT || 1000000), userDailyLimit: Number(process.env.TTS_USER_DAILY_LIMIT || 40), globalDailyLimit: Number(process.env.TTS_GLOBAL_DAILY_LIMIT || 400) }),
  synthesize: async value => (await tts.synthesizeSpeech({ input: { text: value.text }, voice: { languageCode: value.languageCode, name: value.voice }, audioConfig: { audioEncoding: value.audioEncoding, speakingRate: value.speakingRate, pitch: value.pitch } }, { timeout: 20000 }))[0].audioContent,
});
exports.tts = onRequest({ region: 'asia-northeast3', memory: '256MiB', minInstances: 0, maxInstances: 1, concurrency: 20, timeoutSeconds: 40 }, app);
