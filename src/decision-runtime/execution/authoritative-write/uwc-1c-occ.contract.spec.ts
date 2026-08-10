import {
  CORRIDOR_OCC_STRATEGIES,
  evaluateAtomicOccDecision,
  resolveWriteTargetOccKind,
  resolveWriteTargetsOccKinds,
} from './expected-write-version';
import { OccAtomicWriteSimulator } from './occ-atomic-write.simulator';
import { AUTHORITATIVE_WRITE_TARGET_PROFILES } from './write-target.registry';
import {
  UWC_1C_OCC_CODE_COMPLETE,
  UWC_1C_OCC_SWITCH_AUTHORIZED,
  UWC_1C_OCC_UNLOCKED,
  UWC_AUTHORITATIVE_DUAL_GATE_STATUS,
} from './corridor-write-mode.config';
import {
  AuthoritativeWriteHandlerRegistryService,
  setHandlerRegistryForTests,
} from './corridor-handler.registry';
import {
  AuthoritativeWriteShadowProbeService,
  clearShadowProbeAuditEntries,
  getShadowProbeAuditEntries,
  setAuthoritativeWriteShadowProbeForTests,
} from './authoritative-write-shadow-probe.service';

describe('UWC-1c ExpectedWriteVersion OCC', () => {
  it('declares corridor OCC strategies without TravelContext global version', () => {
    expect(CORRIDOR_OCC_STRATEGIES.UNIFIED_EXECUTE.primary).toBe('PLAN_VERSION');
    expect(CORRIDOR_OCC_STRATEGIES.ITINERARY_ADJUST.primary).toBe(
      'RESOURCE_VERSION_SET',
    );
    expect(CORRIDOR_OCC_STRATEGIES.ACTIONS_COMMIT.primary).toBe(
      'RESOURCE_VERSION_SET',
    );
    for (const s of Object.values(CORRIDOR_OCC_STRATEGIES)) {
      expect(s.notes.toLowerCase()).not.toContain('travelcontext ssot');
    }
  });

  it('resolves mixed WriteTargets to OCC kinds', () => {
    const unified = resolveWriteTargetsOccKinds(
      'UNIFIED_EXECUTE',
      AUTHORITATIVE_WRITE_TARGET_PROFILES.UNIFIED_EXECUTE.writeTargets,
    );
    expect(unified.some((x) => x.occKind === 'PLAN_VERSION')).toBe(true);
    expect(
      resolveWriteTargetOccKind('ACTIONS_COMMIT', {
        kind: 'in_memory_dedup',
      }),
    ).toBe('NO_VERSION_REQUIRED');
    expect(
      resolveWriteTargetOccKind('ITINERARY_ADJUST', {
        kind: 'trip_itinerary_item',
      }),
    ).toBe('RESOURCE_VERSION_SET');
  });

  it('idempotency replay returns ALREADY_APPLIED before freshness conflict', () => {
    const decision = evaluateAtomicOccDecision({
      idempotencyKey: 'idem-same',
      prior: { key: 'idem-same', status: 'APPLIED' },
      expected: { kind: 'PLAN_VERSION', expectedPlanVersionId: 'pv_old' },
      observed: { kind: 'PLAN_VERSION', observedPlanVersionId: 'pv_new' }, // would conflict
    });
    expect(decision.decision).toBe('ALREADY_APPLIED');
    expect(decision.outcome).toBe('IDEMPOTENT_REPLAY');
    expect(decision.reasonCodes).toContain('ALREADY_APPLIED');
  });

  it('version mismatch returns VERSION_CONFLICT (no silent overwrite)', () => {
    const decision = evaluateAtomicOccDecision({
      idempotencyKey: 'idem-new',
      prior: null,
      expected: {
        kind: 'RESOURCE_VERSION_SET',
        resources: [{ resourceId: 'trip', expectedVersion: 1 }],
      },
      observed: {
        kind: 'RESOURCE_VERSION_SET',
        resources: [{ resourceId: 'trip', observedVersion: 2 }],
      },
    });
    expect(decision.decision).toBe('VERSION_CONFLICT');
    expect(decision.outcome).toBe('CONFLICT');
  });

  it('dual gates: code complete + switch auth → AUTHORITATIVE unlocked', () => {
    expect(UWC_1C_OCC_CODE_COMPLETE).toBe(true);
    expect(UWC_1C_OCC_SWITCH_AUTHORIZED).toBe(true);
    expect(UWC_1C_OCC_UNLOCKED).toBe(true);
    expect(UWC_AUTHORITATIVE_DUAL_GATE_STATUS.unlocked).toBe(true);
  });
});

describe('UWC-1c cross-corridor concurrency (atomic simulator)', () => {
  async function assertAtMostOneSuccess(params: {
    label: string;
    seed: (sim: OccAtomicWriteSimulator) => void;
    expected: import('./expected-write-version').ExpectedWriteVersion;
    next?: {
      nextPlanVersionId?: string;
      nextResourceVersions?: ReadonlyArray<{
        resourceId: string;
        version: string | number;
      }>;
    };
  }) {
    const sim = new OccAtomicWriteSimulator();
    params.seed(sim);
    const keys = ['k1', 'k2', 'k3', 'k4', 'k5'];
    const results = await Promise.all(
      keys.map((idempotencyKey) =>
        sim.tryAtomicWrite({
          idempotencyKey,
          expected: params.expected,
          ...params.next,
        }),
      ),
    );
    const applied = results.filter((r) => r.decision === 'PROCEED');
    const conflicts = results.filter((r) => r.decision === 'VERSION_CONFLICT');
    expect(applied.length).toBe(1);
    expect(conflicts.length).toBe(keys.length - 1);
    // Replaying the winner's key → ALREADY_APPLIED not conflict
    const winnerKey = keys[results.findIndex((r) => r.decision === 'PROCEED')];
    const replay = await sim.tryAtomicWrite({
      idempotencyKey: winnerKey,
      expected: params.expected,
    });
    expect(replay.decision).toBe('ALREADY_APPLIED');
  }

  it('UNIFIED_EXECUTE: same old PLAN_VERSION, different idem keys → ≤1 success', async () => {
    await assertAtMostOneSuccess({
      label: 'UNIFIED_EXECUTE',
      seed: (sim) => sim.seedPlanVersion('pv_v1'),
      expected: { kind: 'PLAN_VERSION', expectedPlanVersionId: 'pv_v1' },
      next: { nextPlanVersionId: 'pv_v2' },
    });
  });

  it('ITINERARY_ADJUST: same old RESOURCE_VERSION, different idem keys → ≤1 success', async () => {
    await assertAtMostOneSuccess({
      label: 'ITINERARY_ADJUST',
      seed: (sim) => sim.seedResource('trip_ia', 10),
      expected: {
        kind: 'RESOURCE_VERSION_SET',
        resources: [{ resourceId: 'trip_ia', expectedVersion: 10 }],
      },
      next: {
        nextResourceVersions: [{ resourceId: 'trip_ia', version: 11 }],
      },
    });
  });

  it('ACTIONS_COMMIT: same old RESOURCE_VERSION, different idem keys → ≤1 success', async () => {
    await assertAtMostOneSuccess({
      label: 'ACTIONS_COMMIT',
      seed: (sim) => sim.seedResource('trip_ac', 'rev-3'),
      expected: {
        kind: 'RESOURCE_VERSION_SET',
        resources: [{ resourceId: 'trip_ac', expectedVersion: 'rev-3' }],
      },
      next: {
        nextResourceVersions: [{ resourceId: 'trip_ac', version: 'rev-4' }],
      },
    });
  });
});

describe('UWC-1c shadow begin/complete capture', () => {
  const registry = new AuthoritativeWriteHandlerRegistryService();
  const probe = new AuthoritativeWriteShadowProbeService(registry);

  beforeEach(() => {
    clearShadowProbeAuditEntries();
    setHandlerRegistryForTests(registry);
    setAuthoritativeWriteShadowProbeForTests(probe);
  });

  afterEach(() => {
    setAuthoritativeWriteShadowProbeForTests(null);
  });

  it('beginCapture then completeCapture records pre-write OCC and zero writes', () => {
    const token = probe.beginCapture('UNIFIED_EXECUTE', {
      tripId: 't1',
      decisionId: 'd1',
      idempotencyKey: 'idem-ue',
      expectedPlanVersionId: 'pv1',
      observedPlanVersionId: 'pv1',
    });
    expect(token).not.toBeNull();
    expect(token!.writesPerformed).toBe(false);
    expect(token!.preWriteOcc?.decision).toBe('PROCEED');

    const entry = probe.completeCapture(token, {
      legacyApplied: true,
      legacyOutcomeHint: 'APPLIED',
    });
    expect(entry?.report?.writesPerformed).toBe(false);
    expect(entry?.capturePhase).toBe('complete');
    expect(
      getShadowProbeAuditEntries().some((e) => e.capturePhase === 'begin'),
    ).toBe(true);
  });
});
