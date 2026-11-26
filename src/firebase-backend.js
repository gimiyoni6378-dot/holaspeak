import { normalizeProgress } from './progression.js';
let sdkPromise;
export const isFirebase = () => window.HOLA_AUTH_PROVIDER === 'firebase';
export const isConfigured = () => Boolean(window.HOLA_FIREBASE_CONFIG?.apiKey && window.HOLA_FIREBASE_CONFIG?.projectId);
async function sdk() {
  if (!isConfigured()) throw new Error('Firebase 연결을 준비 중이에요.');
  sdkPromise ||= (async () => {
    const [appSDK, authSDK, dataSDK] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
    const app = appSDK.initializeApp(window.HOLA_FIREBASE_CONFIG);
    const auth = authSDK.getAuth(app), db = dataSDK.getFirestore(app);
    auth.languageCode = 'ko';
    await authSDK.setPersistence(auth, authSDK.browserLocalPersistence);
    let knownUid;
    authSDK.onAuthStateChanged(auth, user => {
      const uid = user?.uid || null;
      if (knownUid !== undefined && uid !== knownUid) setTimeout(() => window.dispatchEvent(new Event('hola:firebase-auth-change')), 0);
      knownUid = uid;
    });
    return { ...authSDK, ...dataSDK, auth, db };
  })().catch(error => { sdkPromise = null; throw error; });
  return sdkPromise;
}
function authError(error) {
  const messages = {
    'auth/invalid-credential': '이메일 또는 비밀번호를 확인해 주세요.',
    'auth/email-already-in-use': '이미 가입된 이메일이에요. 로그인해 주세요.',
    'auth/weak-password': '비밀번호를 8자 이상 입력해 주세요.',
    'auth/invalid-email': '이메일 주소를 확인해 주세요.',
    'auth/popup-blocked': '팝업이 차단됐어요. 팝업을 허용한 뒤 다시 눌러 주세요.',
    'auth/popup-closed-by-user': '로그인 창이 닫혔어요. 다시 시도할 수 있어요.',
    'auth/unauthorized-domain': '이 사이트 주소를 Firebase의 승인된 도메인에 추가해야 해요.',
    'auth/operation-not-allowed': 'Firebase 콘솔에서 해당 로그인 방법을 활성화해 주세요.',
    'auth/too-many-requests': '요청이 많아요. 잠시 후 다시 시도해 주세요.',
    'auth/network-request-failed': '인터넷 연결을 확인해 주세요.',
    'permission-denied': 'Firestore 데이터베이스와 사용자 접근 규칙 설정을 확인해 주세요.',
    'unavailable': '데이터 서버에 연결하지 못했어요. 연결 후 다시 시도해 주세요.',
  };
  return Object.assign(new Error(messages[error.code] || error.message || '계정을 연결하지 못했어요.'), { status: error.status, code: error.code });
}
async function account(guest) {
  const f = await sdk(); await f.auth.authStateReady();
  const user = f.auth.currentUser;
  if (!user) return null;
  const ref = f.doc(f.db, 'users', user.uid);
  let data;
  try {
    data = await f.runTransaction(f.db, async tx => {
      const snapshot = await tx.get(ref);
      if (snapshot.exists()) return snapshot.data();
      const initial = { uid: user.uid, displayName: (user.displayName || '학습자').slice(0, 80), email: user.email || '', progress: normalizeProgress(guest), revision: 0, createdAt: f.serverTimestamp(), updatedAt: f.serverTimestamp() };
      tx.set(ref, initial); return initial;
    });
  } catch (error) { throw authError(error); }
  return { token: await user.getIdToken(), user: { id: user.uid, name: data.displayName, email: user.email || '', emailVerified: user.emailVerified, provider: 'firebase' }, progress: data.progress, revision: data.revision };
}
export const restoreFirebase = guest => account(guest);
export async function firebaseIdToken(uid) {
  const f = await sdk(); await f.auth.authStateReady();
  const user = f.auth.currentUser;
  if (!user || user.uid !== uid) throw Object.assign(new Error('로그인한 뒤 Google 음성을 이용해 주세요.'), { status: 401 });
  return user.getIdToken(); // Firebase refreshes an expired token before use.
}
export async function signInGoogle(guest) {
  const f = await sdk();
  try { const provider = new f.GoogleAuthProvider(); provider.setCustomParameters({ prompt: 'select_account' }); await f.signInWithPopup(f.auth, provider); return await account(guest); } catch (error) { throw authError(error); }
}
export async function signInEmail(email, password, guest) {
  const f = await sdk();
  try { await f.signInWithEmailAndPassword(f.auth, email.trim(), password); return await account(guest); } catch (error) { throw authError(error); }
}
export async function createEmailAccount(name, email, password, guest) {
  if (password.length < 8) throw new Error('비밀번호를 8자 이상 입력해 주세요.');
  const f = await sdk();
  try {
    const { user } = await f.createUserWithEmailAndPassword(f.auth, email.trim(), password);
    await f.updateProfile(user, { displayName: name.trim().slice(0, 80) || '학습자' });
    const data = await account(guest);
    try { await f.sendEmailVerification(user); data.notice = '가입을 완료했어요. 받은 편지함에서 이메일 인증도 진행해 주세요.'; }
    catch { data.notice = '가입은 완료됐어요. 인증 메일은 잠시 후 다시 보낼 수 있어요.'; }
    return data;
  } catch (error) { throw authError(error); }
}
export async function resendVerification() {
  const f = await sdk();
  if (!f.auth.currentUser) throw new Error('먼저 로그인해 주세요.');
  try { await f.sendEmailVerification(f.auth.currentUser); } catch (error) { throw authError(error); }
}
export async function resetPassword(email) {
  const f = await sdk();
  try { await f.sendPasswordResetEmail(f.auth, email.trim()); } catch (error) { throw authError(error); }
}
export async function firebaseRequest(path, options = {}, owner) {
  const f = await sdk(); await f.auth.authStateReady();
  const user = f.auth.currentUser;
  if (!user || !owner || user.uid !== owner.user.id) throw Object.assign(new Error('다시 로그인해 주세요.'), { status: 401 });
  try {
    if (path === '/auth/logout') { await f.signOut(f.auth); return null; }
    if (path === '/me') return account();
    if (path === '/progress') {
      const ref = f.doc(f.db, 'users', user.uid);
      const result = await f.runTransaction(f.db, async tx => {
        const snapshot = await tx.get(ref);
        if (!snapshot.exists()) throw new Error('사용자 데이터가 없어요. 다시 로그인해 주세요.');
        const current = snapshot.data();
        if (options.method !== 'DELETE' && current.revision !== options.body.revision) throw Object.assign(new Error('다른 기기의 새 기록이 있어요. 사용할 기록을 선택해 주세요.'), { status: 409 });
        const progress = normalizeProgress(options.method === 'DELETE' ? {} : options.body.progress);
        const revision = current.revision + 1;
        tx.update(ref, { progress, revision, updatedAt: f.serverTimestamp() });
        return { user: owner.user, progress, revision };
      });
      return result;
    }
    throw new Error('음성 서비스는 다음 단계에서 연결할 예정이에요.');
  } catch (error) { throw authError(error); }
}
