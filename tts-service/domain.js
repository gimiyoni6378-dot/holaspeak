'use strict';
const { createHash } = require('node:crypto');
const VOICES = ['es-ES-Neural2-A', 'es-ES-Neural2-E', 'es-ES-Neural2-H'];
const EMPTY = { xp: 0, completed: 0, month: 0, streak: 0, review: 0, pronunciationDone: false, signupPromptSeen: false, quests: { lesson: false, review: false, speak: false } };
function progress(input = {}) {
  const out = structuredClone(EMPTY);
  for (const k of ['xp', 'completed', 'month', 'streak', 'review']) if (Number.isSafeInteger(input[k]) && input[k] >= 0 && input[k] <= 10000000) out[k] = input[k];
  for (const k of ['pronunciationDone', 'signupPromptSeen']) out[k] = input[k] === true;
  for (const k of Object.keys(out.quests)) out.quests[k] = input.quests?.[k] === true;
  return out;
}
function speech(input = {}) {
  const text = typeof input.text === 'string' ? input.text.trim().normalize('NFC') : '';
  const voice = input.voice ?? VOICES[0], speakingRate = input.speakingRate ?? 0.9, pitch = input.pitch ?? 0;
  if (!text || [...text].length > 240 || !VOICES.includes(voice) || !Number.isFinite(speakingRate) || speakingRate < 0.5 || speakingRate > 1.5 || !Number.isFinite(pitch) || pitch < -5 || pitch > 5 || (input.audioEncoding && input.audioEncoding !== 'MP3')) throw new Error('Invalid speech settings');
  return { text, voice, languageCode: 'es-ES', speakingRate, pitch, audioEncoding: 'MP3', version: 1 };
}
function speechKey(settings) { return createHash('sha256').update(JSON.stringify(settings)).digest('hex'); }
function validWav(w) {
  return Buffer.isBuffer(w) && w.length >= 3244 && w.length <= 960044 && w.toString('ascii', 0, 4) === 'RIFF' && w.toString('ascii', 8, 12) === 'WAVE' && w.readUInt32LE(4) === w.length - 8 && w.toString('ascii', 12, 16) === 'fmt ' && w.readUInt32LE(16) === 16 && w.readUInt16LE(20) === 1 && w.readUInt16LE(22) === 1 && w.readUInt32LE(24) === 16000 && w.readUInt32LE(28) === 32000 && w.readUInt16LE(32) === 2 && w.readUInt16LE(34) === 16 && w.toString('ascii', 36, 40) === 'data' && w.readUInt32LE(40) === w.length - 44 && (w.length - 44) % 2 === 0;
}
function assessment(body) {
  const best = body.NBest?.[0];
  if (body.RecognitionStatus !== 'Success' || !best) return null;
  const scores = best.PronunciationAssessment || best;
  const read = v => Number.isFinite(v) && v >= 0 && v <= 100 ? v : null;
  const result = { accuracy: read(scores.AccuracyScore), fluency: read(scores.FluencyScore), completeness: read(scores.CompletenessScore), pronunciation: read(scores.PronScore), words: (best.Words || []).map(w => ({ word: w.Word, accuracy: read((w.PronunciationAssessment || w).AccuracyScore), error: (w.PronunciationAssessment || w).ErrorType || 'None' })) };
  return result.pronunciation === null ? null : result;
}
module.exports = { VOICES, EMPTY, progress, speech, speechKey, validWav, assessment };
