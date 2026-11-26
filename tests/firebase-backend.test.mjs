import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('Firebase signup creates a profile once and account data survives later logins', async () => {
  globalThis.window = new EventTarget(); window.HOLA_AUTH_PROVIDER = 'firebase'; window.HOLA_FIREBASE_CONFIG = { apiKey: 'test', projectId: 'test' };
  const documents = new Map(), users = new Map(); let sequence = 0;
  const auth = { currentUser: null, authStateReady: async () => {} };
  const sdk = {
    initializeApp: () => ({}), getAuth: () => auth, getFirestore: () => ({}), setPersistence: async () => {}, onAuthStateChanged: () => {},
    createUserWithEmailAndPassword: async (_auth, email) => { const user = { uid: 'user-' + ++sequence, email, displayName: '', emailVerified: false, getIdToken: async () => 'token' }; users.set(email, user); auth.currentUser = user; return { user }; },
    updateProfile: async (user, value) => Object.assign(user, value), sendEmailVerification: async () => {}, signOut: async () => { auth.currentUser = null; },
    signInWithEmailAndPassword: async (_auth, email) => { auth.currentUser = users.get(email); if (!auth.currentUser) throw new Error('Unknown user'); },
    doc: (_db, ...parts) => parts.join('/'), collection: (_db, ...parts) => parts.join('/'), orderBy: () => ({}), limit: () => ({}), query: path => path, getDocs: async path => ({ docs: [...documents].filter(([key]) => key.startsWith(path + '/')).map(([key, value]) => ({ id: key.split('/').at(-1), data: () => structuredClone(value) })) }), serverTimestamp: () => 'server-time',
    runTransaction: async (_db, callback) => callback({ get: async ref => ({ exists: () => documents.has(ref), data: () => structuredClone(documents.get(ref)) }), set: (ref, value) => documents.set(ref, structuredClone(value)), update: (ref, value) => documents.set(ref, { ...documents.get(ref), ...structuredClone(value) }) }),
  };
  globalThis.__firebaseTestSDK = sdk;
  const source = (await readFile(new URL('../src/firebase-backend.js', import.meta.url), 'utf8'))
    .replace("'./progression.js'", JSON.stringify(new URL('../src/progression.js', import.meta.url).href))
    .replace("Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')])", 'Promise.resolve([globalThis.__firebaseTestSDK, globalThis.__firebaseTestSDK, globalThis.__firebaseTestSDK])');
  const backend = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const alice = await backend.createEmailAccount('Alice', 'alice@example.test', 'password123', { xp: 80 });
  assert.equal(alice.user.name, 'Alice'); assert.equal(alice.progress.xp, 80);
  assert.equal(await backend.firebaseIdToken(alice.user.id), 'token');
  const result = await backend.firebaseRequest('/progress', { method: 'PUT', body: { progress: { xp: 125 }, revision: 0 } }, alice);
  assert.equal(result.progress.level, 2); assert.equal(result.progress.points, 125);
  await assert.rejects(backend.firebaseRequest('/progress', { method: 'PUT', body: { progress: { xp: 999 }, revision: 0 } }, alice), e => e.status === 409);
  const evaluation = { id: '00000000-0000-4000-8000-000000000001', reference: 'Hola', created: Date.now(), result: { pronunciation: 85, words: [] } };
  await backend.saveAssessment(evaluation, alice.user.id);
  await backend.saveAssessment({ ...evaluation, result: { pronunciation: 99 } }, alice.user.id);
  const history = await backend.firebaseRequest('/assessments', { method: 'GET' }, alice);
  assert.equal(history.items.length, 1); assert.equal(history.items[0].result.pronunciation, 85);
  assert.equal(history.items[0].audio, undefined);
  await backend.firebaseRequest('/auth/logout', { method: 'POST' }, alice);
  await assert.rejects(backend.firebaseIdToken(alice.user.id), e => e.status === 401);
  const bob = await backend.createEmailAccount('Bob', 'bob@example.test', 'password123', {});
  assert.equal(bob.progress.points, 0);
  await assert.rejects(backend.saveAssessment(evaluation, alice.user.id), /같은 계정/);
  assert.equal((await backend.firebaseRequest('/assessments', { method: 'GET' }, bob)).items.length, 0);
  await assert.rejects(backend.firebaseRequest('/me', {}, alice), e => e.status === 401);
  await backend.firebaseRequest('/auth/logout', { method: 'POST' }, bob);
  const restored = await backend.signInEmail('alice@example.test', 'password123', { xp: 999 });
  assert.equal(restored.progress.points, 125); assert.equal(restored.revision, 1);
});
