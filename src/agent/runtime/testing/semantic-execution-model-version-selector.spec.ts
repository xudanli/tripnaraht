// src/agent/runtime/testing/semantic-execution-model-version-selector.spec.ts
import {
  selectExecutionModelVersion,
  type ExecutionModelVersionSelectionContext,
} from './semantic-execution-model-version-selector';

describe('selectExecutionModelVersion', () => {
  const lineageV1V2 = ['v1', 'v2'] as const;
  const allowV1ToV2 = { v1: ['v2'] as const, v2: [] as const } as Readonly<Record<string, readonly string[]>>;

  it('host_default when no requested version', () => {
    const r = selectExecutionModelVersion({} satisfies ExecutionModelVersionSelectionContext);
    expect(r).toEqual({
      ok: true,
      activeExecutionModelVersion: 'v1',
      suggestAllowExecutionModelUpgradeForImport: false,
      basis: 'host_default',
    });
  });

  it('requested_aligned when requested matches host', () => {
    const r = selectExecutionModelVersion(
      { requestedExecutionModelVersion: 'v1' },
      { hostExecutionModelVersion: 'v1' },
    );
    expect(r).toMatchObject({ ok: true, basis: 'requested_aligned', suggestAllowExecutionModelUpgradeForImport: false });
  });

  it('requested_behind_host with allowlist suggests import upgrade', () => {
    const r = selectExecutionModelVersion(
      { requestedExecutionModelVersion: 'v1' },
      {
        hostExecutionModelVersion: 'v2',
        compatibility: { versionLineage: [...lineageV1V2], upgradeAllowlist: allowV1ToV2 },
      },
    );
    expect(r).toEqual({
      ok: true,
      activeExecutionModelVersion: 'v2',
      suggestAllowExecutionModelUpgradeForImport: true,
      basis: 'requested_behind_host',
    });
  });

  it('requested_behind_host without allowlist edge does not suggest upgrade', () => {
    const r = selectExecutionModelVersion(
      { requestedExecutionModelVersion: 'v1' },
      {
        hostExecutionModelVersion: 'v2',
        compatibility: { versionLineage: [...lineageV1V2], upgradeAllowlist: { v1: [], v2: [] } },
      },
    );
    expect(r).toEqual({
      ok: true,
      activeExecutionModelVersion: 'v2',
      suggestAllowExecutionModelUpgradeForImport: false,
      basis: 'requested_behind_host',
    });
  });

  it('rejects requested newer than host', () => {
    const r = selectExecutionModelVersion(
      { requestedExecutionModelVersion: 'v2' },
      { hostExecutionModelVersion: 'v1', compatibility: { versionLineage: [...lineageV1V2], upgradeAllowlist: allowV1ToV2 } },
    );
    expect(r).toEqual({
      ok: false,
      reason: 'requested_newer_than_host',
      hostExecutionModelVersion: 'v1',
      requestedExecutionModelVersion: 'v2',
    });
  });

  it('rejects unknown requested version', () => {
    const r = selectExecutionModelVersion({ requestedExecutionModelVersion: 'v9' });
    expect(r).toEqual({
      ok: false,
      reason: 'unknown_requested_version',
      hostExecutionModelVersion: 'v1',
      requestedExecutionModelVersion: 'v9',
    });
  });
});
