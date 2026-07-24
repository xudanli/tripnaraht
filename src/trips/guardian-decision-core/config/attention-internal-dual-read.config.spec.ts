import {
  DEFAULT_ATTENTION_INTERNAL_DUAL_READ_TRIP_IDS,
  isAttentionInternalDualReadEnabled,
  isTripEligibleForAttentionInternalDualRead,
  isUserEligibleForAttentionInternalDualRead,
} from '../config/attention-internal-dual-read.config';

describe('attention-internal-dual-read.config', () => {
  const prev: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of [
      'ATTENTION_INTERNAL_DUAL_READ_ENABLED',
      'ATTENTION_INTERNAL_DUAL_READ_TRIP_ALLOWLIST',
      'ATTENTION_INTERNAL_DUAL_READ_USER_IDS',
      'ATTENTION_INTERNAL_DUAL_READ_EMAIL_DOMAINS',
    ]) {
      prev[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('defaults trip allowlist to exec-slip + weather canary trips', () => {
    process.env.ATTENTION_INTERNAL_DUAL_READ_ENABLED = '1';
    for (const tripId of DEFAULT_ATTENTION_INTERNAL_DUAL_READ_TRIP_IDS) {
      expect(isTripEligibleForAttentionInternalDualRead(tripId)).toBe(true);
    }
    expect(isTripEligibleForAttentionInternalDualRead('other-trip')).toBe(false);
  });

  it('allows internal email domains and admin roles', () => {
    expect(
      isUserEligibleForAttentionInternalDualRead({
        userId: 'u1',
        email: 'exec-slip-canary@tripnara.dev',
      }),
    ).toBe(true);
    expect(
      isUserEligibleForAttentionInternalDualRead({
        userId: 'u2',
        roles: ['ADMIN'],
      }),
    ).toBe(true);
    expect(
      isUserEligibleForAttentionInternalDualRead({
        userId: 'u3',
        email: 'guest@example.com',
      }),
    ).toBe(false);
  });

  it('is disabled unless ATTENTION_INTERNAL_DUAL_READ_ENABLED=1', () => {
    expect(isAttentionInternalDualReadEnabled()).toBe(false);
    process.env.ATTENTION_INTERNAL_DUAL_READ_ENABLED = '1';
    expect(isAttentionInternalDualReadEnabled()).toBe(true);
  });
});
