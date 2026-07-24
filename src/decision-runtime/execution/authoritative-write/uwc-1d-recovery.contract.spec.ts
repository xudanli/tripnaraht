import {
  evaluateCompensationDecision,
} from './compensation-pipeline.util';
import {
  UWC_1D_COMPENSATION_EXEC_AUTHORIZED,
  UWC_COMPENSATION_AUTH_GATE_STATUS,
  UWC_COMPENSATION_EXEC_HARD_BLOCK_REASON,
} from './compensation-auth.gate';
import {
  CORRIDOR_RECOVERY_PROFILES,
  getCorridorRecoveryProfile,
} from './corridor-recovery.profile';
import {
  UWC_CORRIDOR_CUTOVER_STATUS,
  UWC_CUTOVER_AUTO_UNLOCK_FORBIDDEN,
  UWC_CUTOVER_REVIEW_ORDER,
  getNextCutoverCandidate,
} from './corridor-cutover.gate';
import type { CompensationCommand } from './recovery-contract.types';
import {
  EXTERNAL_COMPENSATION_SURFACES,
  UWC_RECOVERY_FORBIDDEN,
} from './recovery-contract.types';
import { UWC_1C_OCC_UNLOCKED } from './corridor-write-mode.config';

function baseCompensation(
  overrides: Partial<CompensationCommand> &
    Pick<
      CompensationCommand,
      'corridor' | 'layer' | 'expectedCurrentVersion' | 'observedCurrentVersion' | 'reverseDiff'
    >,
): CompensationCommand {
  return {
    schemaId: 'tripnara.compensation_command@v1',
    contractVersion: '1.0.0',
    originalIdempotencyKey: 'orig-1',
    compensationIdempotencyKey: 'comp-1',
    authorityVerdict: 'ALLOW',
    authorityReasonCodes: [],
    audit: {
      tripId: 'trip_1',
      requestedAt: '2026-07-24T12:00:00Z',
      reason: 'test_compensation',
    },
    ...overrides,
  };
}

describe('UWC-1d recovery profiles', () => {
  it('registers three corridor profiles with Actions NO_EFFECTIVE_SIDE_EFFECT', () => {
    expect(CORRIDOR_RECOVERY_PROFILES.ACTIONS_COMMIT.capabilities).toContain(
      'NO_EFFECTIVE_SIDE_EFFECT',
    );
    expect(
      CORRIDOR_RECOVERY_PROFILES.ACTIONS_COMMIT.layers,
    ).not.toContain('POST_EFFECTIVE_COMPENSATING_WRITE');
    expect(CORRIDOR_RECOVERY_PROFILES.UNIFIED_EXECUTE.internalReverseTargets).toEqual(
      expect.arrayContaining(['PlanVersion', 'Trip', 'ItineraryItem']),
    );
    expect(CORRIDOR_RECOVERY_PROFILES.ITINERARY_ADJUST.internalReverseTargets).toEqual(
      expect.arrayContaining(['ItineraryItem', 'Trip']),
    );
    for (const p of Object.values(CORRIDOR_RECOVERY_PROFILES)) {
      expect(p.externalCompensation).toBe('EXTERNAL_COMPENSATION_UNSUPPORTED');
      expect(p.externalSurfaces).toEqual([...EXTERNAL_COMPENSATION_SURFACES]);
    }
  });

  it('forbids universal rollback / snapshot restore patterns', () => {
    expect(UWC_RECOVERY_FORBIDDEN).toEqual(
      expect.arrayContaining([
        'UNIVERSAL_ROLLBACK_BUS',
        'RESTORE_OLD_SNAPSHOT',
      ]),
    );
  });
});

describe('UWC-1d compensation pipeline', () => {
  it('TRANSACTION_ABORT yields ABORTED_PRE_EFFECTIVE without writes', () => {
    const cmd = baseCompensation({
      corridor: 'UNIFIED_EXECUTE',
      layer: 'TRANSACTION_ABORT',
      expectedCurrentVersion: {
        kind: 'PLAN_VERSION',
        expectedPlanVersionId: 'pv1',
      },
      observedCurrentVersion: {
        kind: 'PLAN_VERSION',
        observedPlanVersionId: 'pv1',
      },
      reverseDiff: {
        schemaId: 'tripnara.compensation_reverse_diff@v1',
        basedOnCurrentVersion: {
          kind: 'PLAN_VERSION',
          expectedPlanVersionId: 'pv1',
        },
        reverseOps: [{ op: 'noop_abort' }],
        internalTargets: ['PlanVersion'],
        externalSurfacesTouched: [],
      },
    });
    const d = evaluateCompensationDecision(cmd);
    expect(d.outcome).toBe('ABORTED_PRE_EFFECTIVE');
    expect(d.writesPerformed).toBe(false);
  });

  it('ACTIONS post-effective is rejected (layer not in profile / NO_EFFECTIVE_SIDE_EFFECT)', () => {
    const cmd = baseCompensation({
      corridor: 'ACTIONS_COMMIT',
      layer: 'POST_EFFECTIVE_COMPENSATING_WRITE',
      expectedCurrentVersion: { kind: 'NO_VERSION_REQUIRED' },
      observedCurrentVersion: { kind: 'NO_VERSION_REQUIRED' },
      reverseDiff: {
        schemaId: 'tripnara.compensation_reverse_diff@v1',
        basedOnCurrentVersion: { kind: 'NO_VERSION_REQUIRED' },
        reverseOps: [],
        internalTargets: [],
        externalSurfacesTouched: [],
      },
    });
    const d = evaluateCompensationDecision(cmd);
    expect(d.outcome).toBe('REJECTED');
    expect(d.reasonCodes).toEqual(
      expect.arrayContaining(['LAYER_NOT_IN_PROFILE']),
    );
    expect(
      getCorridorRecoveryProfile('ACTIONS_COMMIT').capabilities,
    ).toContain('NO_EFFECTIVE_SIDE_EFFECT');
  });

  it('ACTIONS TRANSACTION_ABORT → NO_EFFECT stub', () => {
    const cmd = baseCompensation({
      corridor: 'ACTIONS_COMMIT',
      layer: 'TRANSACTION_ABORT',
      expectedCurrentVersion: { kind: 'NO_VERSION_REQUIRED' },
      observedCurrentVersion: { kind: 'NO_VERSION_REQUIRED' },
      reverseDiff: {
        schemaId: 'tripnara.compensation_reverse_diff@v1',
        basedOnCurrentVersion: { kind: 'NO_VERSION_REQUIRED' },
        reverseOps: [],
        internalTargets: [],
        externalSurfacesTouched: [],
      },
    });
    const d = evaluateCompensationDecision(cmd);
    expect(d.outcome).toBe('NO_EFFECT');
    expect(d.writesPerformed).toBe(false);
  });

  it('version drift → COMPENSATION_CONFLICT (no overwrite)', () => {
    const cmd = baseCompensation({
      corridor: 'UNIFIED_EXECUTE',
      layer: 'POST_EFFECTIVE_COMPENSATING_WRITE',
      expectedCurrentVersion: {
        kind: 'PLAN_VERSION',
        expectedPlanVersionId: 'pv_at_apply',
      },
      observedCurrentVersion: {
        kind: 'PLAN_VERSION',
        observedPlanVersionId: 'pv_later_edit',
      },
      reverseDiff: {
        schemaId: 'tripnara.compensation_reverse_diff@v1',
        basedOnCurrentVersion: {
          kind: 'PLAN_VERSION',
          expectedPlanVersionId: 'pv_at_apply',
        },
        reverseOps: [{ op: 'reverse_set_effective', to: 'pv_parent' }],
        internalTargets: ['PlanVersion'],
        externalSurfacesTouched: [],
      },
    });
    const d = evaluateCompensationDecision(cmd, { shadowOnly: true });
    expect(d.outcome).toBe('COMPENSATION_CONFLICT');
    expect(d.writesPerformed).toBe(false);
    expect(d.reasonCodes).toContain('COMPENSATION_CONFLICT');
  });

  it('matching version under shadow → NOT_AUTHORIZED (gate closed, zero writes)', () => {
    expect(UWC_1D_COMPENSATION_EXEC_AUTHORIZED).toBe(false);
    expect(UWC_COMPENSATION_AUTH_GATE_STATUS.mayExecuteWrites).toBe(false);
    const cmd = baseCompensation({
      corridor: 'ITINERARY_ADJUST',
      layer: 'POST_EFFECTIVE_COMPENSATING_WRITE',
      expectedCurrentVersion: {
        kind: 'RESOURCE_VERSION_SET',
        resources: [{ resourceId: 'trip_1', expectedVersion: 5 }],
      },
      observedCurrentVersion: {
        kind: 'RESOURCE_VERSION_SET',
        resources: [{ resourceId: 'trip_1', observedVersion: 5 }],
      },
      reverseDiff: {
        schemaId: 'tripnara.compensation_reverse_diff@v1',
        basedOnCurrentVersion: {
          kind: 'RESOURCE_VERSION_SET',
          resources: [{ resourceId: 'trip_1', expectedVersion: 5 }],
        },
        reverseOps: [{ op: 'reverse_itinerary_edits' }],
        internalTargets: ['ItineraryItem', 'Trip'],
        externalSurfacesTouched: [],
      },
    });
    const d = evaluateCompensationDecision(cmd, { shadowOnly: true });
    expect(d.outcome).toBe('NOT_AUTHORIZED');
    expect(d.reasonCodes).toContain(UWC_COMPENSATION_EXEC_HARD_BLOCK_REASON);
    expect(d.writesPerformed).toBe(false);
  });

  it('idempotent compensation replay → ALREADY_APPLIED before OCC', () => {
    const cmd = baseCompensation({
      corridor: 'UNIFIED_EXECUTE',
      layer: 'POST_EFFECTIVE_COMPENSATING_WRITE',
      expectedCurrentVersion: {
        kind: 'PLAN_VERSION',
        expectedPlanVersionId: 'pv_old',
      },
      observedCurrentVersion: {
        kind: 'PLAN_VERSION',
        observedPlanVersionId: 'pv_new',
      },
      reverseDiff: {
        schemaId: 'tripnara.compensation_reverse_diff@v1',
        basedOnCurrentVersion: {
          kind: 'PLAN_VERSION',
          expectedPlanVersionId: 'pv_old',
        },
        reverseOps: [{ op: 'reverse' }],
        internalTargets: ['PlanVersion'],
        externalSurfacesTouched: [],
      },
    });
    const d = evaluateCompensationDecision(cmd, {
      priorCompensationApplied: true,
      shadowOnly: true,
    });
    expect(d.outcome).toBe('ALREADY_APPLIED');
    expect(d.writesPerformed).toBe(false);
  });

  it('external surfaces → EXTERNAL_UNSUPPORTED', () => {
    const cmd = baseCompensation({
      corridor: 'UNIFIED_EXECUTE',
      layer: 'POST_EFFECTIVE_COMPENSATING_WRITE',
      expectedCurrentVersion: {
        kind: 'PLAN_VERSION',
        expectedPlanVersionId: 'pv1',
      },
      observedCurrentVersion: {
        kind: 'PLAN_VERSION',
        observedPlanVersionId: 'pv1',
      },
      reverseDiff: {
        schemaId: 'tripnara.compensation_reverse_diff@v1',
        basedOnCurrentVersion: {
          kind: 'PLAN_VERSION',
          expectedPlanVersionId: 'pv1',
        },
        reverseOps: [{ op: 'refund' }],
        internalTargets: ['PlanVersion'],
        externalSurfacesTouched: ['refund'],
      },
    });
    const d = evaluateCompensationDecision(cmd);
    expect(d.outcome).toBe('EXTERNAL_UNSUPPORTED');
  });

  it('rejects RESTORE_OLD_SNAPSHOT pattern', () => {
    const cmd = baseCompensation({
      corridor: 'UNIFIED_EXECUTE',
      layer: 'POST_EFFECTIVE_COMPENSATING_WRITE',
      expectedCurrentVersion: {
        kind: 'PLAN_VERSION',
        expectedPlanVersionId: 'pv1',
      },
      observedCurrentVersion: {
        kind: 'PLAN_VERSION',
        observedPlanVersionId: 'pv1',
      },
      reverseDiff: {
        schemaId: 'tripnara.compensation_reverse_diff@v1',
        basedOnCurrentVersion: {
          kind: 'PLAN_VERSION',
          expectedPlanVersionId: 'pv1',
        },
        reverseOps: [{ op: 'RESTORE_OLD_SNAPSHOT', snapshotId: 'snap_1' }],
        internalTargets: ['PlanVersion'],
        externalSurfacesTouched: [],
      },
    });
    const d = evaluateCompensationDecision(cmd);
    expect(d.outcome).toBe('REJECTED');
    expect(d.reasonCodes).toContain('RESTORE_OLD_SNAPSHOT_FORBIDDEN');
  });
});

describe('UWC-1d cutover gate', () => {
  it('next canary candidate is ACTIONS_COMMIT only', () => {
    expect(getNextCutoverCandidate()).toBe('ACTIONS_COMMIT');
    expect(UWC_CUTOVER_REVIEW_ORDER[0]).toBe('ACTIONS_COMMIT');
    expect(UWC_CORRIDOR_CUTOVER_STATUS.ACTIONS_COMMIT).toBe(
      'PENDING_CANARY_REVIEW',
    );
    expect(UWC_CORRIDOR_CUTOVER_STATUS.ITINERARY_ADJUST).toBe(
      'BLOCKED_UNTIL_PRIOR_CORRIDOR',
    );
    expect(UWC_CORRIDOR_CUTOVER_STATUS.UNIFIED_EXECUTE).toBe(
      'BLOCKED_UNTIL_PRIOR_CORRIDOR',
    );
    expect(UWC_CUTOVER_AUTO_UNLOCK_FORBIDDEN.length).toBeGreaterThan(0);
  });

  it('write AUTHORITATIVE remains locked; compensation gate independent', () => {
    expect(UWC_1C_OCC_UNLOCKED).toBe(false);
    expect(UWC_COMPENSATION_AUTH_GATE_STATUS.execAuthorized).toBe(false);
    expect(getCorridorRecoveryProfile('ACTIONS_COMMIT').productNotes).toMatch(
      /NO_EFFECTIVE_SIDE_EFFECT|STUB/,
    );
  });
});
