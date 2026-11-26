export const VOICES = ['es-ES-ElviraNeural', 'es-ES-AlvaroNeural'];
export const fail = (status, message) => Object.assign(new Error(message), { status });
export function settings(input = {}) {
  const text = typeof input.text === 'string' ? input.text.trim().normalize('NFC') : '';
  const voice = input.voice ?? VOICES[0], speakingRate = input.speakingRate ?? 0.9, pitch = input.pitch ?? 0;
  if (!text || [...text].length > 240 || /[\u0000-\u001f]/.test(text) || !VOICES.includes(voice) || !Number.isFinite(speakingRate) || speakingRate < 0.5 || speakingRate > 1.5 || !Number.isFinite(pitch) || pitch < -5 || pitch > 5) throw fail(400, '문장과 음성 설정을 확인해 주세요.');
  return { text, voice, speakingRate, pitch, languageCode: 'es-ES', audioEncoding: 'MP3', provider: 'azure', version: 1 };
}
const escape = s => s.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);
export function ssml(s) {
  const rate = Math.round((s.speakingRate - 1) * 100), pitch = s.pitch;
  return `<speak version="1.0" xml:lang="es-ES"><voice name="${s.voice}"><prosody rate="${rate >= 0 ? '+' : ''}${rate}%" pitch="${pitch >= 0 ? '+' : ''}${pitch}st">${escape(s.text)}</prosody></voice></speak>`;
}
export function wav(base64) {
  if (typeof base64 !== 'string' || base64.length > 1280060 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw fail(400, '녹음 형식을 확인해 주세요.');
  let bytes;
  try { bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0)); } catch { throw fail(400, '녹음 형식을 확인해 주세요.'); }
  const v = new DataView(bytes.buffer), tag = (at, text) => [...text].every((c, i) => bytes[at + i] === c.charCodeAt(0));
  if (bytes.length < 3244 || bytes.length > 960044 || !tag(0, 'RIFF') || !tag(8, 'WAVE') || !tag(12, 'fmt ') || !tag(36, 'data') || v.getUint32(4, true) !== bytes.length - 8 || v.getUint32(16, true) !== 16 || v.getUint16(20, true) !== 1 || v.getUint16(22, true) !== 1 || v.getUint32(24, true) !== 16000 || v.getUint32(28, true) !== 32000 || v.getUint16(32, true) !== 2 || v.getUint16(34, true) !== 16 || v.getUint32(40, true) !== bytes.length - 44 || bytes.length % 2) throw fail(400, '0.1~30초의 녹음을 다시 보내 주세요.');
  return { bytes, seconds: Math.ceil((bytes.length - 44) / 32000) };
}
export function assessment(body) {
  const best = body.NBest?.[0];
  if (body.RecognitionStatus !== 'Success' || !best) throw fail(422, '음성이 충분히 들리지 않았어요. 다시 말해 주세요.');
  const scores = best.PronunciationAssessment || best;
  const read = value => Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
  const result = { accuracy: read(scores.AccuracyScore), fluency: read(scores.FluencyScore), completeness: read(scores.CompletenessScore), pronunciation: read(scores.PronScore), words: (best.Words || []).slice(0, 100).map(w => ({ word: String(w.Word || '').slice(0, 120), accuracy: read((w.PronunciationAssessment || w).AccuracyScore), error: String((w.PronunciationAssessment || w).ErrorType || 'None').slice(0, 40) })) };
  if (result.pronunciation === null) throw fail(502, '평가 결과를 읽지 못했어요.');
  return result;
}
// Calendar UTC month; reservations count even if an upstream request fails.
// Other applications must not use the same Azure resource's free allowance.
export const LIMITS = { tts: 500000, assessment: 18000, userTts: 5000, userAssessment: 300 };
export function quotaKeys(uid, kind, now = new Date()) {
  return [{ key: `${now.toISOString().slice(0, 7)}:${kind}`, limit: LIMITS[kind] }, { key: `${now.toISOString().slice(0, 10)}:${uid}:${kind}`, limit: kind === 'tts' ? LIMITS.userTts : LIMITS.userAssessment }];
}
