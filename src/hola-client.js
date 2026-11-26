import { isFirebase, isConfigured, firebaseRequest, restoreFirebase, signInGoogle, signInEmail, createEmailAccount, resendVerification, resetPassword, firebaseIdToken } from './firebase-backend.js';
import { normalizeProgress, todayKey } from './progression.js';
// Public configuration only; provider service credentials stay on the server.
const apiUrl = () => (window.HOLA_API_URL || '').replace(/\/$/, '');
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Private mode/storage quota: current session stays usable. */ } };
let session;
try { session = JSON.parse(sessionStorage.getItem('hola-session') || 'null'); } catch { session = null; }
let busy = false, syncError = '', conflict = false, notice = '';
const listeners = new Set();
const notify = () => listeners.forEach(fn => fn());
export const getSession = () => session;
export const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export const getStatus = () => ({ busy, syncError, notice, conflict, provider: isFirebase() ? 'firebase' : 'legacy', configured: isFirebase() ? isConfigured() : Boolean(apiUrl() && window.HOLA_GOOGLE_CLIENT_ID) });
export function storageKey() { return session ? `hola-user:${session.user.id}` : 'hola'; }
export function loadProgress() { return read(storageKey(), {}).progress || read(storageKey(), {}); }
function persistSession() { try { session ? sessionStorage.setItem('hola-session', JSON.stringify(session)) : sessionStorage.removeItem('hola-session'); } catch {} }
export async function api(path, { method = 'GET', body, token = session?.token, binary = false, signal } = {}) {
  if (path === '/synthesize' && window.HOLA_TTS_PROVIDER === 'device') throw new Error('기기 음성 모드에서는 외부 TTS 서버를 호출하지 않아요.');
  if (isFirebase() && (path !== '/synthesize' && (path !== '/assessments' || method === 'GET'))) return firebaseRequest(path, { method, body }, session);
  const endpoint = path === '/synthesize' ? (window.HOLA_TTS_API_URL || apiUrl()).replace(/\/$/, '') : apiUrl();
  if (!endpoint) throw new Error('Azure 음성 서버를 준비 중이에요.');
  if (isFirebase()) token = await firebaseIdToken(session?.user.id);
  const response = await fetch(endpoint + path, { method, cache: 'no-store', signal: signal || AbortSignal.timeout(35000), headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const error = new Error(data.error || (response.status === 401 ? '로그인 시간이 만료됐어요. 로그아웃 후 다시 로그인해 주세요.' : '연결하지 못했어요. 다시 시도해 주세요.'));
    error.status = response.status; throw error;
  }
  return response.status === 204 ? null : binary ? response.blob() : response.json();
}
export function saveProgress(progress) {
  progress = normalizeProgress(progress);
  const previous = read(storageKey(), {});
  write(storageKey(), { progress, revision: previous.revision ?? session?.revision ?? 0, dirty: Boolean(session) });
  notify();
  if (session) void sync();
}
export async function sync() {
  if (!session || busy || conflict) return;
  const owner = session, key = storageKey();
  busy = true; syncError = ''; notify();
  try {
    let state = read(key, {});
    while (state.dirty && session === owner) {
      const snapshot = JSON.stringify(state.progress);
      const data = await api('/progress', { method: 'PUT', token: owner.token, body: { progress: state.progress, revision: state.revision } });
      const latest = read(key, {});
      write(key, { ...latest, revision: data.revision, dirty: JSON.stringify(latest.progress) !== snapshot });
      owner.revision = data.revision; persistSession(); state = read(key, {});
    }
  } catch (error) { if (session === owner) { syncError = error.message; conflict = error.status === 409; } }
  finally { busy = false; notify(); }
}
export async function resolveConflict(useLocal) {
  if (!session || busy) return;
  const owner = session, key = storageKey();
  const data = await api('/me');
  if (session !== owner) return;
  const local = read(key, {});
  write(key, { progress: useLocal ? local.progress : data.progress, revision: data.revision, dirty: useLocal });
  conflict = false; syncError = ''; notify();
  window.dispatchEvent(new Event('hola:progress-loaded'));
  if (useLocal) await sync();
}
export async function login(credential) {
  if (session || busy) return;
  busy = true; syncError = ''; notify();
  try {
    const guest = loadProgress();
    const data = await api('/auth/google', { method: 'POST', body: { credential, guest }, token: null });
    session = { token: data.token, user: data.user, revision: data.revision };
    // Existing-account unsynced edits retain their revision so conflicts remain visible.
    const key = storageKey(), local = read(key, {});
    if (!local.dirty) write(key, { progress: data.progress, revision: data.revision, dirty: false });
    write('hola', {}); persistSession(); conflict = false;
    window.dispatchEvent(new Event('hola:progress-loaded'));
    window.dispatchEvent(new Event('hola:authenticated'));
  } catch (error) { syncError = error.message; }
  finally { busy = false; notify(); }
  if (session) void sync();
}
export async function restore() {
  if (isFirebase()) {
    try {
      const data = await restoreFirebase(session ? undefined : loadProgress());
      if (!data) { session = null; persistSession(); window.dispatchEvent(new Event('hola:progress-loaded')); notify(); return; }
      const old = session;
      session = { token: data.token, user: data.user, revision: data.revision };
      const key = storageKey(), local = read(key, {});
      if (!local.dirty) write(key, { progress: data.progress, revision: data.revision, dirty: false });
      if (!old) write('hola', {});
      persistSession(); window.dispatchEvent(new Event('hola:progress-loaded')); notify();
      if (local.dirty) await sync();
    } catch (error) { syncError = error.message; notify(); }
    return;
  }
  if (!session) return;
  const owner = session, key = storageKey();
  try {
    if (read(key, {}).dirty) { await sync(); return; }
    const data = await api('/me');
    if (owner !== session || read(key, {}).dirty) return;
    write(key, { progress: data.progress, revision: data.revision, dirty: false });
    window.dispatchEvent(new Event('hola:progress-loaded'));
  } catch (error) { syncError = error.message; notify(); }
}
export async function logout() {
  if (busy) return;
  busy = true; notify();
  try { await api('/auth/logout', { method: 'POST' }); } catch { /* Local logout must work offline; server token expires. */ }
  session = null; conflict = false; syncError = ''; notice = ''; busy = false; persistSession();
  window.google?.accounts.id.disableAutoSelect();
  window.dispatchEvent(new Event('hola:progress-loaded')); notify();
}
export async function resetProgress() {
  if (busy) throw new Error('동기화가 끝난 뒤 다시 시도해 주세요.');
  if (session) { const data = await api('/progress', { method: 'DELETE' }); write(storageKey(), { progress: data.progress, revision: data.revision, dirty: false }); }
  else write('hola', {});
  window.dispatchEvent(new Event('hola:progress-loaded')); notify();
}
window.addEventListener('online', () => { void restore(); });
window.addEventListener('hola:firebase-auth-change', () => { if (!busy) void restore(); });
window.addEventListener('storage', e => { if (e.key === storageKey()) { window.dispatchEvent(new Event('hola:progress-loaded')); notify(); } });
export async function mountGoogleButton(element) {
  if (isFirebase()) return;
  if (!getStatus().configured) return;
  if (!window.google?.accounts?.id) {
    await new Promise((resolve, reject) => {
      let script = document.querySelector('script[data-google-identity]');
      if (!script) { script = document.createElement('script'); script.src = 'https://accounts.google.com/gsi/client'; script.async = true; script.dataset.googleIdentity = ''; document.head.append(script); }
      const timer = setTimeout(() => { script.remove(); reject(new Error('Google 로그인을 불러오지 못했어요.')); }, 15000);
      script.addEventListener('load', () => { clearTimeout(timer); resolve(); }, { once: true });
      script.addEventListener('error', () => { clearTimeout(timer); script.remove(); reject(new Error('Google 로그인 연결을 확인해 주세요.')); }, { once: true });
    });
  }
  if (!element.isConnected) return;
  window.google.accounts.id.initialize({ client_id: window.HOLA_GOOGLE_CLIENT_ID, callback: ({ credential }) => { void login(credential); }, auto_select: false });
  window.google.accounts.id.renderButton(element, { theme: 'outline', size: 'large', text: 'continue_with', locale: 'ko' });
}

async function authenticate(action) {
  if (session || busy) return;
  busy = true; syncError = ''; notice = ''; notify();
  try {
    const data = await action(loadProgress());
    session = { token: data.token, user: data.user, revision: data.revision };
    const key = storageKey(), local = read(key, {});
    if (!local.dirty) write(key, { progress: data.progress, revision: data.revision, dirty: false });
    write('hola', {}); persistSession(); conflict = false; notice = data.notice || '';
    window.dispatchEvent(new Event('hola:progress-loaded'));
    window.dispatchEvent(new Event('hola:authenticated'));
  } catch (error) { syncError = error.message; }
  finally { busy = false; notify(); }
  if (session) void sync();
}
export const loginGoogle = () => authenticate(guest => signInGoogle(guest));
export const loginEmail = (email, password) => authenticate(guest => signInEmail(email, password, guest));
export const signupEmail = (name, email, password) => authenticate(guest => createEmailAccount(name, email, password, guest));
export const verifyEmail = resendVerification;
export const forgotPassword = resetPassword;
export function checkIn() {
  if (!session) throw new Error('출석을 저장하려면 먼저 로그인해 주세요.');
  const progress = loadProgress(), today = todayKey();
  saveProgress({ ...progress, attendanceDates: [...(progress.attendanceDates || []), today] });
  window.dispatchEvent(new Event('hola:progress-loaded'));
}
