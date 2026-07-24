/**
 * Task E0 — Shadow review evidence persistence feature flags.
 */

import { createHash } from 'node:crypto';

export const SHADOW_BLINDING_VERSION = 'v1';
export const SHADOW_ELIGIBILITY_VERSION = 'v1';
export const SHADOW_REVIEW_FORM_VERSION = 'v1';
export const DEFAULT_EXPECTED_REVIEW_COUNT = 1;

const HEX_KEY_PATTERN = /^[0-9a-fA-F]{64}$/;

export class ShadowEvidencePersistenceConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShadowEvidencePersistenceConfigError';
  }
}

export function isShadowEvidencePersistenceEnabled(): boolean {
  const raw = process.env.SHADOW_EVIDENCE_PERSISTENCE_ENABLED?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

export function resolveBlindingSalt(): string {
  return (
    process.env.SHADOW_REVIEW_BLINDING_SALT?.trim() ||
    process.env.SHADOW_EVIDENCE_PERSISTENCE_SALT?.trim() ||
    'dev-shadow-blinding-salt-change-in-production'
  );
}

/** Fail fast when persistence is on but encryption key is missing or malformed. */
export function assertShadowEvidencePersistenceConfigOnStartup(): void {
  if (!isShadowEvidencePersistenceEnabled()) return;

  const hex = process.env.SHADOW_REVIEW_BLINDING_ENCRYPTION_KEY?.trim();
  if (!hex) {
    throw new ShadowEvidencePersistenceConfigError(
      'SHADOW_EVIDENCE_PERSISTENCE_ENABLED=1 requires SHADOW_REVIEW_BLINDING_ENCRYPTION_KEY ' +
        '(64 hex chars). Do not rely on auto-generated keys — store in staging secret manager.',
    );
  }
  if (!HEX_KEY_PATTERN.test(hex)) {
    throw new ShadowEvidencePersistenceConfigError(
      'SHADOW_REVIEW_BLINDING_ENCRYPTION_KEY must be exactly 64 hexadecimal characters.',
    );
  }
}

export function resolveBlindingEncryptionKey(): Buffer {
  if (isShadowEvidencePersistenceEnabled()) {
    const hex = process.env.SHADOW_REVIEW_BLINDING_ENCRYPTION_KEY?.trim();
    if (!hex || !HEX_KEY_PATTERN.test(hex)) {
      throw new ShadowEvidencePersistenceConfigError(
        'Shadow evidence persistence enabled but SHADOW_REVIEW_BLINDING_ENCRYPTION_KEY is missing or invalid.',
      );
    }
    return Buffer.from(hex, 'hex');
  }

  const hex = process.env.SHADOW_REVIEW_BLINDING_ENCRYPTION_KEY?.trim();
  if (hex && HEX_KEY_PATTERN.test(hex)) {
    return Buffer.from(hex, 'hex');
  }
  return createHash('sha256').update(resolveBlindingSalt()).digest();
}
