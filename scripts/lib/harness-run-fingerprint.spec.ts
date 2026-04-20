import { buildConfigHash, buildRunFingerprint, stableStringify, validateRunFingerprintCompleteness } from './harness-run-fingerprint';

describe('harness-run-fingerprint', () => {
  describe('stableStringify', () => {
    it('sorts object keys deterministically', () => {
      const a = { z: 1, a: { m: 2, b: 1 } };
      const b = { a: { b: 1, m: 2 }, z: 1 };
      expect(stableStringify(a)).toBe(stableStringify(b));
    });

    it('omits undefined', () => {
      expect(stableStringify({ a: 1, b: undefined })).toBe(stableStringify({ a: 1 }));
    });
  });

  describe('buildConfigHash', () => {
    it('is stable for same semantic config regardless of key order', () => {
      const x = {
        mcRerankEnabled: true,
        minTopMargin: 0.05,
        sampleCount: 64,
      };
      const y = {
        sampleCount: 64,
        minTopMargin: 0.05,
        mcRerankEnabled: true,
      };
      expect(buildConfigHash(x)).toBe(buildConfigHash(y));
    });

    it('changes when replay-affecting config changes', () => {
      const a = {
        mcRerankEnabled: true,
        minTopMargin: 0.05,
        sampleCount: 64,
      };
      const b = {
        mcRerankEnabled: true,
        minTopMargin: 0.1,
        sampleCount: 64,
      };
      expect(buildConfigHash(a)).not.toBe(buildConfigHash(b));
    });
  });

  describe('buildRunFingerprint', () => {
    it('includes runId when provided', () => {
      const fp = buildRunFingerprint({
        caseCount: 1,
        caseId: 'c1',
        configForHash: { a: 1 },
        runId: 'eval-run-abc',
      });
      expect(fp.runId).toBe('eval-run-abc');
    });
  });

  describe('validateRunFingerprintCompleteness', () => {
    it('requires fixtureVersionsDistinct for td-replay-fixtures when cases > 0', () => {
      const bad = validateRunFingerprintCompleteness({
        reportKind: 'td-replay-fixtures',
        caseCount: 2,
        fp: {
          caseCount: 2,
          generatedAt: 't',
          configHash: 'a'.repeat(64),
          mappingVersion: 'v2',
          seed: null,
          gitSha: null,
          schemaVersions: {},
          fixtureVersionsDistinct: null,
        } as any,
      });
      expect(bad.mode).toBe('td-replay-fixtures');
      expect(bad.ok).toBe(false);
      expect(bad.errors.some((e) => e.includes('fixtureVersionsDistinct'))).toBe(true);
    });

    it('passes td-replay-fixtures when distinct versions present', () => {
      const ok = validateRunFingerprintCompleteness({
        reportKind: 'td-replay-fixtures',
        caseCount: 1,
        fp: {
          caseCount: 1,
          generatedAt: 't',
          configHash: 'b'.repeat(64),
          mappingVersion: 'v2',
          seed: null,
          gitSha: null,
          schemaVersions: {},
          fixtureVersionsDistinct: ['engine-dso-v1'],
        } as any,
      });
      expect(ok.mode).toBe('td-replay-fixtures');
      expect(ok.ok).toBe(true);
    });
  });
});
