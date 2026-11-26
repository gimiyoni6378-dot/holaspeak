import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
let services;
export function firebaseServices(env = process.env) {
  if (services) return services;
  const projectId = env.FIREBASE_PROJECT_ID;
  let key;
  try { key = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON || ''); } catch { throw new Error('Server credentials not configured'); }
  if (!projectId || key.project_id !== projectId || !key.client_email || !key.private_key) throw new Error('Server credentials do not match project');
  const app = getApps().find(app => app.name === 'hola-speech') || initializeApp({ credential: cert(key), projectId }, 'hola-speech');
  services = { auth: getAuth(app), db: getFirestore(app) };
  return services;
}
