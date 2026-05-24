import { createHash, randomBytes } from 'node:crypto';

import { VERIFY_TOKEN_BYTES } from './auth.constants';

export function generateVerifyToken(): { raw: string; hash: string } {
  const raw = randomBytes(VERIFY_TOKEN_BYTES).toString('base64url');
  const hash = createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

export function hashVerifyToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
