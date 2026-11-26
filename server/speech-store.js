import { createHash, randomUUID } from 'node:crypto';
import { settings, ssml, wav, assessment, quotaKeys, fail } from '../azure-worker/src/domain.js';
const digest = value => createHash('sha256').update(value).digest('hex');
export class FirestoreSpeechStore {
  constructor(db, env, upstream = fetch) { this.db = db; this.env = env; this.upstream = upstream; }
  quotas(uid, kind, now) { return quotaKeys(uid, kind, new Date(now)).map(q => ({ ...q, ref: this.db.doc(`_speechUsage/${digest(q.key)}`) })); }
  async reserveTransaction(tx, uid, kind, amount, now) {
    const quotas = this.quotas(uid, kind, now), snapshots = await tx.getAll(...quotas.map(q => q.ref));
    const next = snapshots.map((snap, i) => {
      const used = snap.exists ? snap.data().amount : 0;
      // Corrupt counters fail closed rather than resetting to zero.
      if (!Number.isSafeInteger(used) || used < 0) throw fail(503, '음성 사용량을 확인하지 못했어요.');
      if (used + amount > quotas[i].limit) throw fail(429, '음성 무료 사용 한도에 도달했어요. 저장된 예시 음성은 계속 들을 수 있어요.');
      return used + amount;
    });
    for (let i = 0; i < quotas.length; i++) tx.set(quotas[i].ref, { amount: next[i], period: quotas[i].key.slice(0, 7), updated: now });
  }
  async reserve(uid, kind, amount) { const now = Date.now(); await this.db.runTransaction(tx => this.reserveTransaction(tx, uid, kind, amount, now)); }
  async azure(url, init) {
    let response;
    try { response = await this.upstream(url, { ...init, signal: AbortSignal.timeout(25000) }); }
    catch { throw fail(503, 'Azure 응답을 받지 못했어요. 잠시 후 다시 시도해 주세요.'); }
    if (!response.ok) throw fail(response.status === 429 ? 429 : 502, response.status === 429 ? 'Azure 무료 사용 한도 또는 요청 제한에 도달했어요.' : 'Azure 음성 설정을 확인해 주세요.');
    return response;
  }
  async synthesize(uid, input) {
    const s = settings(input), key = digest(JSON.stringify(s)), markup = ssml(s), owner = randomUUID(), now = Date.now();
    // Fixed number of slots bounds audio storage to 500 * 650 KB (< 1 GB).
    // Hash collisions evict old examples; they never return another example.
    const ref = this.db.doc(`_speechAudio/${parseInt(key.slice(0, 8), 16) % 500}`);
    const cached = await this.db.runTransaction(async tx => {
      const snapshot = await tx.get(ref), current = snapshot.exists ? snapshot.data() : {};
      if (current.key === key && current.audio?.length && current.audio.length <= 650000) return current.audio;
      if (current.lockedUntil > now) throw fail(409, '예시 음성을 준비 중이에요. 잠시 후 다시 눌러 주세요.');
      // Read all counters before writing anything, including this cache lease.
      await this.reserveTransaction(tx, uid, 'tts', markup.length, now);
      tx.set(ref, { key, owner, lockedUntil: now + 60000 });
      return null;
    });
    if (cached) return new Uint8Array(cached);
    try {
      const response = await this.azure(`https://${this.env.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, { method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': this.env.AZURE_SPEECH_KEY, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-16khz-32kbitrate-mono-mp3' }, body: markup });
      const audio = Buffer.from(await response.arrayBuffer());
      if (!audio.length || audio.length > 650000 || !response.headers.get('Content-Type')?.includes('audio')) throw fail(502, '예시 음성을 읽지 못했어요.');
      await this.db.runTransaction(async tx => {
        const snapshot = await tx.get(ref);
        if (snapshot.data()?.owner === owner) tx.set(ref, { key, audio, lockedUntil: 0, created: Date.now() });
      });
      return new Uint8Array(audio);
    } catch (error) {
      // Preserve charged reservations even after timeouts; release only our lease.
      try { await this.db.runTransaction(async tx => { const snapshot = await tx.get(ref); if (snapshot.data()?.owner === owner) tx.set(ref, { key, lockedUntil: 0 }); }); } catch {}
      throw error;
    }
  }
  async assess(uid, input) {
    const reference = settings({ text: input.reference }).text, { bytes, seconds } = wav(input.audio);
    await this.reserve(uid, 'assessment', seconds); // Finish durable reservation before Azure.
    const config = { ReferenceText: reference, GradingSystem: 'HundredMark', Granularity: 'Phoneme', Dimension: 'Comprehensive', EnableMiscue: true };
    const response = await this.azure(`https://${this.env.AZURE_SPEECH_REGION}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=es-ES&format=detailed`, { method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': this.env.AZURE_SPEECH_KEY, 'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000', 'Pronunciation-Assessment': Buffer.from(JSON.stringify(config)).toString('base64') }, body: bytes });
    // No recording/result stored here, including on retries or identical input.
    return { id: randomUUID(), reference, created: Date.now(), result: assessment(await response.json()) };
  }
}
