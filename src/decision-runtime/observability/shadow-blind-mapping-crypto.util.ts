/**
 * Encrypt blind mapping at rest — never exposed via public API.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { resolveBlindingEncryptionKey } from './shadow-evidence-persistence.config';

const ALGO = 'aes-256-gcm';

export interface BlindMappingPayload {
  optionAIs: 'AUTHORITY' | 'SHADOW';
  optionBIs: 'AUTHORITY' | 'SHADOW';
}

export class ShadowBlindMappingDecryptError extends Error {
  constructor(
    message = 'Cannot decrypt blind mapping — encryption key mismatch or corrupted ciphertext',
  ) {
    super(message);
    this.name = 'ShadowBlindMappingDecryptError';
  }
}

export function encryptBlindMapping(payload: BlindMappingPayload): string {
  const key = resolveBlindingEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const plaintext = JSON.stringify(payload);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

export function decryptBlindMapping(ciphertext: string): BlindMappingPayload {
  const key = resolveBlindingEncryptionKey();
  const [ivB64, tagB64, dataB64] = ciphertext.split('.');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new ShadowBlindMappingDecryptError('Invalid blind mapping ciphertext format');
  }
  try {
    const iv = Buffer.from(ivB64, 'base64url');
    const tag = Buffer.from(tagB64, 'base64url');
    const data = Buffer.from(dataB64, 'base64url');
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(data),
      decipher.final(),
    ]).toString('utf8');
    return JSON.parse(plaintext) as BlindMappingPayload;
  } catch (err: unknown) {
    if (err instanceof ShadowBlindMappingDecryptError) throw err;
    throw new ShadowBlindMappingDecryptError(
      'Cannot decrypt blind mapping — encryption key mismatch or corrupted ciphertext. ' +
        'Do not re-blind historical cases; restore the original SHADOW_REVIEW_BLINDING_ENCRYPTION_KEY.',
    );
  }
}
