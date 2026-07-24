import {
  assertShadowEvidencePersistenceConfigOnStartup,
  isShadowEvidencePersistenceEnabled,
  ShadowEvidencePersistenceConfigError,
} from './shadow-evidence-persistence.config';

describe('shadow-evidence-persistence.config', () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.SHADOW_EVIDENCE_PERSISTENCE_ENABLED;
    delete process.env.SHADOW_REVIEW_BLINDING_ENCRYPTION_KEY;
  });

  afterAll(() => {
    process.env = env;
  });

  it('does not require key when persistence disabled', () => {
    expect(() => assertShadowEvidencePersistenceConfigOnStartup()).not.toThrow();
  });

  it('fails startup when persistence enabled without key', () => {
    process.env.SHADOW_EVIDENCE_PERSISTENCE_ENABLED = '1';
    expect(() => assertShadowEvidencePersistenceConfigOnStartup()).toThrow(
      ShadowEvidencePersistenceConfigError,
    );
  });

  it('fails startup when key is not 64 hex chars', () => {
    process.env.SHADOW_EVIDENCE_PERSISTENCE_ENABLED = '1';
    process.env.SHADOW_REVIEW_BLINDING_ENCRYPTION_KEY = 'abc';
    expect(() => assertShadowEvidencePersistenceConfigOnStartup()).toThrow(
      /64 hexadecimal/i,
    );
  });

  it('passes when persistence enabled with valid key', () => {
    process.env.SHADOW_EVIDENCE_PERSISTENCE_ENABLED = '1';
    process.env.SHADOW_REVIEW_BLINDING_ENCRYPTION_KEY = 'a'.repeat(64);
    expect(() => assertShadowEvidencePersistenceConfigOnStartup()).not.toThrow();
    expect(isShadowEvidencePersistenceEnabled()).toBe(true);
  });
});
