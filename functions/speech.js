'use strict';
const { createHash } = require('node:crypto');
const VOICES = ['es-ES-Neural2-A', 'es-ES-Neural2-E', 'es-ES-Neural2-H'];
function settings(input = {}) {
  const text = typeof input.text === 'string' ? input.text.trim().normalize('NFC') : '';
  const voice = input.voice ?? VOICES[0], speakingRate = input.speakingRate ?? 0.9, pitch = input.pitch ?? 0;
  if (!text || [...text].length > 240 || !VOICES.includes(voice) ||
      !Number.isFinite(speakingRate) || speakingRate < 0.5 || speakingRate > 1.5 ||
      !Number.isFinite(pitch) || pitch < -5 || pitch > 5 ||
      (input.languageCode && input.languageCode !== 'es-ES') ||
      (input.audioEncoding && input.audioEncoding !== 'MP3') || (input.version && input.version !== 1)) throw new Error('Invalid speech settings');
  return { text, voice, speakingRate, pitch, languageCode: 'es-ES', audioEncoding: 'MP3', version: 1 };
}
const audioKey = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
module.exports = { settings, audioKey, VOICES };
