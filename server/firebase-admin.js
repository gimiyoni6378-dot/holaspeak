import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyUser } from '../azure-worker/src/auth.js';
let services;
export function firebaseServices(env = process.env) {
  if (services) return services;
  const projectId = env.FIREBASE_PROJECT_ID;
  let key;
  try { key = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON || ''); } catch { throw new Error('Server credentials not configured'); }
  if (!projectId || key.project_id !== projectId || !key.client_email || !key.private_key) throw new Error('Server credentials do not match project');
  const app = getApps().find(app => app.name === 'hola-speech') || initializeApp({ credential: cert(key), projectId }, 'hola-speech');
  // Verify the same Firebase RS256 issuer/audience/expiry with Google's JWKS.
  // Avoid the Admin Auth CommonJS dependency chain on Vercel's ESM runtime.
  services = { auth: { verifyIdToken: async token => ({ uid: await verifyUser(new Request('https://speech.internal', { headers: { Authorization: `Bearer ${token}` } }), env) }) }, db: getFirestore(app) };
  return services;
}
