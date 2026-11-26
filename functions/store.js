'use strict';
const { createHash } = require('node:crypto');
function createVoiceStore(db, { monthlyCharacterLimit = 1000000, userDailyLimit = 40, globalDailyLimit = 400 } = {}) {
  if (![monthlyCharacterLimit, userDailyLimit, globalDailyLimit].every(n => Number.isSafeInteger(n) && n > 0) || monthlyCharacterLimit > 1000000) throw new Error('Usage limits must keep the monthly hard cap at or below 1,000,000 characters');
  return {
    async getAudio(key) {
      const doc = await db.collection('_ttsAudio').doc(key).get();
      if (!doc.exists) return null;
      const bytes = Buffer.from(doc.data().audioBase64 || '', 'base64');
      return bytes.length > 0 && bytes.length <= 650000 ? bytes : null;
    },
    async putAudio(key, audio) {
      if (!audio.length || audio.length > 650000) throw new Error('Audio exceeds Firestore cache limit');
      await db.collection('_ttsAudio').doc(key).set({ audioBase64: audio.toString('base64'), contentType: 'audio/mpeg', createdAt: new Date() });
    },
    async reserveUsage(uid, characters, now = new Date()) {
      // Google's monthly SKU tiers reset at midnight US Pacific, including DST.
      const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now), month = day.slice(0, 7);
      const userHash = createHash('sha256').update(uid).digest('hex');
      const userRef = db.collection('_ttsUsage').doc(`user-${userHash}-${day}`);
      const dayRef = db.collection('_ttsUsage').doc(`day-${day}`);
      const monthRef = db.collection('_ttsUsage').doc(`month-${month}`);
      return db.runTransaction(async tx => {
        const [user, globalDay, globalMonth] = await Promise.all([tx.get(userRef), tx.get(dayRef), tx.get(monthRef)]);
        const userCount = user.data()?.requests || 0, dayCount = globalDay.data()?.requests || 0, monthCharacters = globalMonth.data()?.characters || 0;
        if (userCount >= userDailyLimit || dayCount >= globalDailyLimit || monthCharacters + characters > monthlyCharacterLimit) return false;
        // Reservations are retained on synthesis failure to keep retries bounded.
        tx.set(userRef, { requests: userCount + 1, day });
        tx.set(dayRef, { requests: dayCount + 1, day });
        tx.set(monthRef, { characters: monthCharacters + characters, month });
        return true;
      });
    },
  };
}
module.exports = { createVoiceStore };
