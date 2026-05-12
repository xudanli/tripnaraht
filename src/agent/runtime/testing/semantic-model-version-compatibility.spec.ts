// src/agent/runtime/testing/semantic-model-version-compatibility.spec.ts
import type { SemanticModelSnapshotDescriptor } from './semantic-model-snapshot-descriptor';
import {
  DEFAULT_EXECUTION_MODEL_COMPATIBILITY_CONTEXT,
  evaluateLedgerImportModelCompatibility,
  executionModelVersionRank,
  formatLedgerImportCompatibilityFailure,
} from './semantic-model-version-compatibility';
import { SEMANTIC_VALIDATION_CONTRACT_REVISION, SEMANTIC_VALIDATION_RESULT_SCHEMA_ID } from './semantic-validation-result-schema';

function desc(executionModelVersion: string, fingerprint: string): SemanticModelSnapshotDescriptor {
  return {
    executionModelVersion: executionModelVersion as SemanticModelSnapshotDescriptor['executionModelVersion'],
    schemaId: SEMANTIC_VALIDATION_RESULT_SCHEMA_ID,
    contractRevision: SEMANTIC_VALIDATION_CONTRACT_REVISION as SemanticModelSnapshotDescriptor['contractRevision'],
    fingerprint,
  };
}

describe('semantic-model-version-compatibility', () => {
  const fpA = 'a'.repeat(64);
  const fpB = 'b'.repeat(64);

  const lineageV1V2 = ['v1', 'v2'] as const;
  const allowV1ToV2 = { v1: ['v2'] as const, v2: [] as const } as Readonly<Record<string, readonly string[]>>;

  it('executionModelVersionRank', () => {
    expect(executionModelVersionRank('v1', lineageV1V2)).toBe(0);
    expect(executionModelVersionRank('v2', lineageV1V2)).toBe(1);
    expect(executionModelVersionRank('v9', lineageV1V2)).toBe(-1);
  });

  it('exact match ignores allowExecutionModelUpgrade', () => {
    const d = desc('v1', fpA);
    expect(
      evaluateLedgerImportModelCompatibility(d, d, DEFAULT_EXECUTION_MODEL_COMPATIBILITY_CONTEXT, {
        allowExecutionModelUpgrade: false,
      }),
    ).toEqual({ ok: true, kind: 'exact' });
  });

  it('fingerprint mismatch without upgrade flag', () => {
    const a = desc('v1', fpA);
    const b = desc('v1', fpB);
    const r = evaluateLedgerImportModelCompatibility(a, b, DEFAULT_EXECUTION_MODEL_COMPATIBILITY_CONTEXT, {});
    expect(r).toEqual({ ok: false, reason: 'fingerprint_mismatch' });
    expect(formatLedgerImportCompatibilityFailure(r, a, b)).toMatch(/model fingerprint mismatch/);
  });

  it('same version fingerprint mismatch even when upgrade allowed', () => {
    const a = desc('v1', fpA);
    const b = desc('v1', fpB);
    const r = evaluateLedgerImportModelCompatibility(a, b, DEFAULT_EXECUTION_MODEL_COMPATIBILITY_CONTEXT, {
      allowExecutionModelUpgrade: true,
    });
    expect(r).toEqual({ ok: false, reason: 'same_version_fingerprint_mismatch' });
  });

  it('rejects newer snapshot than runtime', () => {
    const exported = desc('v2', fpA);
    const current = desc('v1', fpB);
    const r = evaluateLedgerImportModelCompatibility(exported, current, { versionLineage: [...lineageV1V2], upgradeAllowlist: allowV1ToV2 }, {
      allowExecutionModelUpgrade: true,
    });
    expect(r).toEqual({ ok: false, reason: 'snapshot_newer_than_runtime' });
  });

  it('rejects upgrade not on allowlist', () => {
    const exported = desc('v1', fpA);
    const current = desc('v2', fpB);
    const r = evaluateLedgerImportModelCompatibility(
      exported,
      current,
      { versionLineage: [...lineageV1V2], upgradeAllowlist: { v1: [], v2: [] } },
      { allowExecutionModelUpgrade: true },
    );
    expect(r).toEqual({ ok: false, reason: 'upgrade_not_allowlisted' });
  });

  it('allows allowlisted upgrade with fingerprint drift', () => {
    const exported = desc('v1', fpA);
    const current = desc('v2', fpB);
    const r = evaluateLedgerImportModelCompatibility(exported, current, { versionLineage: [...lineageV1V2], upgradeAllowlist: allowV1ToV2 }, {
      allowExecutionModelUpgrade: true,
    });
    expect(r).toEqual({ ok: true, kind: 'upgrade' });
  });

  it('unknown exported version', () => {
    const exported = desc('v9', fpA);
    const current = desc('v1', fpB);
    const r = evaluateLedgerImportModelCompatibility(exported, current, DEFAULT_EXECUTION_MODEL_COMPATIBILITY_CONTEXT, {
      allowExecutionModelUpgrade: true,
    });
    expect(r).toEqual({ ok: false, reason: 'unknown_execution_model_version' });
  });
});
