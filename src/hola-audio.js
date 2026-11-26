import { api } from './hola-client.js';
export const azureVoices = [{ value: 'es-ES-ElviraNeural', label: 'Elvira · 스페인 여성 음성' }, { value: 'es-ES-AlvaroNeural', label: 'Álvaro · 스페인 남성 음성' }];
export const defaultVoice = { voice: 'es-ES-ElviraNeural', voiceURI: 'auto', speakingRate: 0.9, pitch: 0, languageCode: 'es-ES' };
function normalizeVoice(input = {}) {
  return { voice: azureVoices.some(v => v.value === input.voice) ? input.voice : 'es-ES-ElviraNeural', voiceURI: typeof input.voiceURI === 'string' ? input.voiceURI : 'auto', speakingRate: Number.isFinite(input.speakingRate) && input.speakingRate >= 0.5 && input.speakingRate <= 1.5 ? input.speakingRate : 0.9, pitch: Number.isFinite(input.pitch) && input.pitch >= -5 && input.pitch <= 5 ? input.pitch : 0, languageCode: 'es-ES' };
}
export function voiceSettings() { try { return normalizeVoice(JSON.parse(localStorage.getItem('hola-voice') || '{}') || {}); } catch { return { ...defaultVoice }; } }
export function setVoiceSettings(value) { localStorage.setItem('hola-voice', JSON.stringify(normalizeVoice(value))); }
export function spanishVoices() {
  try { return (window.speechSynthesis?.getVoices?.() || []).filter(voice => /^es(?:[-_]|$)/i.test(voice.lang)); } catch { return []; }
}
let playGeneration = 0, currentUtterance;
const status = message => window.dispatchEvent(new CustomEvent('hola:audio-status', { detail: message }));
export function stopAudio() { playGeneration++; try { source?.stop(); } catch {} window.speechSynthesis?.cancel(); currentUtterance = null; }
async function deviceSay(text) {
  stopAudio();
  const generation = playGeneration, settings = voiceSettings();
  const synth = window.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') { status('이 브라우저는 음성 읽기를 지원하지 않아요. Chrome 또는 Safari에서 열어 주세요.'); return; }
  const sentence = typeof text === 'string' ? text.trim().normalize('NFC') : '';
  if (!sentence) return;
  const voices = spanishVoices();
  const selected = voices.find(voice => voice.voiceURI === settings.voiceURI)
    || voices.find(voice => /^es[-_]ES$/i.test(voice.lang) && voice.localService)
    || voices.find(voice => /^es[-_]ES$/i.test(voice.lang))
    || voices.find(voice => voice.localService) || voices[0];
  const utterance = new SpeechSynthesisUtterance(sentence);
  utterance.lang = selected?.lang || settings.languageCode;
  if (selected) utterance.voice = selected;
  utterance.rate = settings.speakingRate; utterance.pitch = 2 ** (settings.pitch / 12);
  utterance.onstart = () => { if (generation === playGeneration) status(selected ? `${selected.name} · 스페인어 발음을 재생 중이에요.` : '기기의 스페인어 음성으로 재생 중이에요.'); };
  utterance.onend = () => { if (generation === playGeneration) { currentUtterance = null; status('발음 재생을 마쳤어요.'); } };
  utterance.onerror = event => { if (generation === playGeneration && !['canceled', 'interrupted'].includes(event.error)) { currentUtterance = null; status('스페인어 음성을 재생하지 못했어요. 기기 설정에서 스페인어 음성을 추가하거나 다른 브라우저에서 열어 주세요.'); } };
  currentUtterance = utterance;
  try {
    synth.resume?.();
    synth.speak(utterance); // Stay in the tap/click gesture, including on mobile.
    status('기기의 스페인어 발음을 준비하고 있어요.');
  } catch { currentUtterance = null; status('음성을 재생하지 못했어요. 다시 눌러 주세요.'); }
}

export function clipSettings(text, value = voiceSettings()) { return { text: text.trim().normalize('NFC'), voice: value.voice, speakingRate: value.speakingRate, pitch: value.pitch, languageCode: 'es-ES', audioEncoding: 'MP3', provider: 'azure', version: 1 }; }
const memory = new Map(), pending = new Map();
let context, source;
async function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('hola-audio-cache', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('clips');
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
async function clipCache(key, blob, remove = false) {
  const db = await database();
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction('clips', blob || remove ? 'readwrite' : 'readonly'), store = tx.objectStore('clips');
    let result;
    if (remove) store.delete(key);
    else if (blob) {
      store.put({ blob, savedAt: Date.now() }, key);
      const all = store.getAllKeys(); all.onsuccess = () => { for (const old of all.result.filter(k => k !== key).slice(0, Math.max(0, all.result.length - 150))) store.delete(old); };
    } else { const request = store.get(key); request.onsuccess = () => { result = request.result?.blob; }; }
    tx.oncomplete = () => resolve(result); tx.onerror = tx.onabort = () => reject(tx.error);
  }); } finally { db.close(); }
}
export async function say(text) {
  if (window.HOLA_TTS_PROVIDER === 'device' || !window.HOLA_TTS_API_URL) return deviceSay(text);
  stopAudio(); const generation = playGeneration, settings = clipSettings(text), key = JSON.stringify(settings);
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    context ||= new Audio(); await context.resume();
    if (!memory.has(key)) {
      let task = pending.get(key);
      if (!task) {
        task = (async () => {
          let blob, buffer;
          try { blob = await clipCache(key); } catch {}
          if (blob) {
            try { buffer = await context.decodeAudioData(await blob.arrayBuffer()); }
            catch { blob = null; try { await clipCache(key, null, true); } catch {} }
          }
          if (!buffer) {
            blob = await api('/synthesize', { method: 'POST', body: settings, binary: true });
            if (!blob.type.includes('audio') || !blob.size || blob.size > 650000) throw new Error('예시 음성 데이터를 읽지 못했어요. 다시 눌러 주세요.');
            buffer = await context.decodeAudioData(await blob.arrayBuffer());
            try { await clipCache(key, blob); } catch {}
          }
          if (memory.size >= 25) memory.delete(memory.keys().next().value);
          memory.set(key, buffer); return buffer;
        })();
        pending.set(key, task);
      }
      try { await task; } finally { if (pending.get(key) === task) pending.delete(key); }
    }
    if (generation !== playGeneration) return;
    source = context.createBufferSource(); source.buffer = memory.get(key); source.connect(context.destination); source.start();
    window.dispatchEvent(new CustomEvent('hola:audio-status', { detail: 'Azure 예시 음성을 재생했어요. 같은 설정으로 다시 들으면 저장된 음성을 사용해요.' }));
  } catch (error) { if (generation === playGeneration) status(error.message || '예시 음성을 재생하지 못했어요.'); }
}

export function pcmWav(samples, sourceRate) {
  const length = Math.floor(samples.length * 16000 / sourceRate);
  const buffer = new ArrayBuffer(44 + length * 2), v = new DataView(buffer);
  const str = (offset, text) => [...text].forEach((c, i) => v.setUint8(offset + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, buffer.byteLength - 8, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i++) {
    // Average each source interval when downsampling instead of dropping samples.
    const start = Math.floor(i * sourceRate / 16000), end = Math.min(samples.length, Math.max(start + 1, Math.floor((i + 1) * sourceRate / 16000)));
    let sum = 0; for (let j = start; j < end; j++) sum += samples[j];
    const sample = Math.max(-1, Math.min(1, sum / (end - start)));
    v.setInt16(44 + i * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
  }
  return new Uint8Array(buffer);
}
export async function recordAttempt({ signal, onReady, onAutoStop }) {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('HTTPS 또는 localhost에서 마이크를 사용할 수 있어요.');
  stopAudio();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  if (signal.aborted) { stream.getTracks().forEach(t => t.stop()); throw new DOMException('Cancelled', 'AbortError'); }
  let recorder, audioContext;
  const chunks = [];
  try {
    recorder = new MediaRecorder(stream);
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    await audioContext.resume();
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  } catch (error) {
    stream.getTracks().forEach(t => t.stop());
    if (audioContext) void audioContext.close();
    throw error;
  }
  return new Promise((resolve, reject) => {
    let timer, cancelled = false;
    const abort = () => { cancelled = true; if (recorder.state !== 'inactive') recorder.stop(); };
    const cleanup = () => { clearTimeout(timer); stream.getTracks().forEach(t => t.stop()); signal.removeEventListener('abort', abort); };
    signal.addEventListener('abort', abort, { once: true });
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onerror = () => { cleanup(); void audioContext.close(); reject(new Error('녹음하지 못했어요. 마이크를 확인해 주세요.')); };
    recorder.onstop = async () => {
      cleanup();
      try {
        if (cancelled) throw new DOMException('Cancelled', 'AbortError');
        const decoded = await audioContext.decodeAudioData(await new Blob(chunks, { type: recorder.mimeType }).arrayBuffer());
        if (decoded.duration < 0.1 || decoded.duration > 30) throw new Error('0.1~30초로 다시 녹음해 주세요.');
        const samples = new Float32Array(decoded.length);
        for (let c = 0; c < decoded.numberOfChannels; c++) { const channel = decoded.getChannelData(c); for (let i = 0; i < samples.length; i++) samples[i] += channel[i] / decoded.numberOfChannels; }
        resolve(pcmWav(samples, decoded.sampleRate));
      } catch (error) { reject(error); } finally { void audioContext.close(); }
    };
    recorder.start();
    const stop = () => { if (recorder.state === 'recording') recorder.stop(); };
    timer = setTimeout(() => { onAutoStop(); stop(); }, 25000);
    onReady(stop);
  });
}
export function audioBase64(bytes) { let binary = ''; for (const b of bytes) binary += String.fromCharCode(b); return btoa(binary); }
