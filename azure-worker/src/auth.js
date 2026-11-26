import { createRemoteJWKSet, jwtVerify } from 'jose';
import { fail } from './domain.js';
const keys = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
export async function verifyUser(request, env) {
  const token = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) throw fail(401, '로그인한 뒤 이용해 주세요.');
  try {
    const { payload } = await jwtVerify(token, keys, { algorithms: ['RS256'], audience: env.FIREBASE_PROJECT_ID, issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`, requiredClaims: ['exp', 'iat', 'sub'] });
    if (!payload.sub || payload.sub.length > 128) throw new Error('Invalid subject');
    return payload.sub;
  } catch { throw fail(401, '로그인을 다시 확인해 주세요.'); }
}
