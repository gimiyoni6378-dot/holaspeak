'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createVoiceStore } = require('../store');
function database() {
  const values = new Map(); let queue = Promise.resolve();
  return { collection: collection => ({ doc: id => { const key = collection + '/' + id; return { key, get: async () => ({ exists: values.has(key), data: () => values.get(key) }), set: async value => values.set(key, value) }; } }),
    runTransaction: callback => { const result = queue.then(() => callback({ get: ref => ref.get(), set: (ref, value) => { values.set(ref.key, value); } })); queue = result.catch(() => {}); return result; },
  };
}
test('usage reservation caps the whole month across days and resets in the next month', async () => {
  const store = createVoiceStore(database(), { monthlyCharacterLimit: 10, userDailyLimit: 10, globalDailyLimit: 10 });
  const day = new Date('2026-11-26T00:00:00Z');
  assert.equal(await store.reserveUsage('a', 4, day), true);
  assert.equal(await store.reserveUsage('b', 6, day), true);
  assert.equal(await store.reserveUsage('a', 1, new Date('2026-11-27T00:00:00Z')), false);
  assert.equal(await store.reserveUsage('a', 1, new Date('2026-12-01T00:00:00Z')), true);
});
test('per-user and global daily limits are transactional and cache survives store recreation', async () => {
  const db = database(), store = createVoiceStore(db, { monthlyCharacterLimit: 100, userDailyLimit: 1, globalDailyLimit: 2 });
  const day = new Date('2026-11-26T00:00:00Z');
  assert.deepEqual(await Promise.all([store.reserveUsage('a', 2, day), store.reserveUsage('a', 2, day)]), [true, false]);
  assert.equal(await store.reserveUsage('b', 2, day), true);
  assert.equal(await store.reserveUsage('c', 2, day), false);
  await store.putAudio('clip', Buffer.from('mp3'));
  assert.equal((await createVoiceStore(db).getAudio('clip')).toString(), 'mp3');
  await assert.rejects(store.putAudio('oversized', Buffer.alloc(650001)));
});
