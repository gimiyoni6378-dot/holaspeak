import { handleSpeech } from '../server/speech-handler.js';
// Native Web API handler on the Node.js runtime (not Edge).
export default { fetch: handleSpeech };
