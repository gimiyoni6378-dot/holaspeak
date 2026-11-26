// Public settings. Never place Google/Azure service keys in this file.
window.HOLA_AUTH_PROVIDER = 'firebase';
window.HOLA_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAUu74So1R-X0ZxUV2ETidICzlPjSN1z50',
  authDomain: 'holaspeak-ac16d.firebaseapp.com',
  projectId: 'holaspeak-ac16d',
  storageBucket: 'holaspeak-ac16d.firebasestorage.app',
  messagingSenderId: '392339216726',
  appId: '1:392339216726:web:ccf8f3c8dcdbea0d4adef7',
};
window.HOLA_ENABLE_TTS = true;
window.HOLA_TTS_PROVIDER = 'azure';
window.HOLA_TTS_API_URL = ''; // Cloudflare Worker URL, after Free/F0 setup.
window.HOLA_ENABLE_SPEECH = false; // Enable only after real microphone smoke test.
window.HOLA_API_URL = ''; // Same Cloudflare Worker URL, no trailing slash.
window.HOLA_GOOGLE_CLIENT_ID = ''; // Legacy backend only; Firebase handles Google login.
