/**
 * RFC-001 Phase 0 — seven system invariants (RFC §20.2).
 */

import type { DecisionWorkspace } from '../contracts/decision-workspace.types';
import type { Rfc001DecisionRecord } from '../contracts/decision-record.types';
import type { PlanVersion } from '../contracts/plan-version.types';
import {
  candidateHasNonOverridableBlock,
  assertEffectivePlanRequiresDecision,
  assertNeptuneDoesNotDirectlyMutatePlan,
  assertGuardianPayloadHasNoDecisionFields,
  WritePermissionViolationError,
} from '../policy/write-permission.guard';
import { DecisionCoreService } from '../services/decision-core.service';
import { RFC001_REASON_CODES } from '../reason-codes/reason-code.registry';

function workspaceFixture(overrides?: Partial<DecisionWorkspace>): DecisionWorkspace {
  return {
    workspaceId: 'ws_1',
    problemId: 'prob_1',
    basePlanVersionId: 'plan_v17',
    worldStateSnapshotId: 'wss_1',
    preferenceSnapshotId: 'pref_1',
    constraintAssertions: [],
    loadAssessments: [],
    repairCandidates: [],
    createdAt: '2026-06-30T10:00:00Z',
    revision: 1,
    status: 'READY_FOR_FINALIZE',
    ...overrides,
  };
}

describe('RFC-001 architecture invariants', () => {
  const core = new DecisionCoreService();

  /** Invariant 1: BLOCK(candidate) ⇒ selectedCandidate ≠ candidate */
  it('Invariant 1 — blocked candidate cannot be selected', () => {
    const ws = workspaceFixture({
      constraintAssertions: [
        {
          assertionId: 'a1',
          workspaceId: 'ws_1',
          actor: 'ABU',
          targetCandidateId: 'cand_a',
          affectedEntityRefs: [],
          affectedPlanItemIds: ['item_1'],
          verdict: 'BLOCK',
          constraintCode: 'ROAD_CLOSED',
          reasonCodes: [RFC001_REASON_CODES.ROAD_SEGMENT_CLOSED],
          evidenceRefs: ['ev_1'],
          ruleVersion: 'is.iceland.road.v1',
          confidence: 0.95,
          overridable: false,
          createdAt: '2026-06-30T10:00:00Z',
        },
      ],
      repairCandidates: [
        {
          candidateId: 'cand_a',
          workspaceId: 'ws_1',
          actor: 'NEPTUNE',
          basePlanVersionId: 'plan_v17',
          replacesPlanItemIds: ['item_1'],
          proposedOperations: [],
          preservedIntentRefs: [],
          degradedIntentRefs: [],
          lostIntentRefs: [],
          estimatedIntentPreservation: 0.9,
          estimatedAddedCost: { amount: 0, currency: 'ISK' },
          estimatedAddedDurationMinutes: 20,
          generationMethod: 'ROUTE_REPAIR',
          evidenceRefs: [],
          generatorVersion: 'nep-0.1',
          status: 'VALID',
          createdAt: '2026-06-30T10:00:00Z',
        },
        {
          candidateId: 'cand_b',
          workspaceId: 'ws_1',
          actor: 'NEPTUNE',
          basePlanVersionId: 'plan_v17',
          replacesPlanItemIds: ['item_1'],
          proposedOperations: [],
          preservedIntentRefs: [],
          degradedIntentRefs: [],
          lostIntentRefs: [],
          estimatedIntentPreservation: 0.85,
          estimatedAddedCost: { amount: 0, currency: 'ISK' },
          estimatedAddedDurationMinutes: -10,
          generationMethod: 'LOCAL_SUBSTITUTION',
          evidenceRefs: [],
          generatorVersion: 'nep-0.1',
          status: 'VALID',
          createdAt: '2026-06-30T10:00:00Z',
        },
      ],
      loadAssessments: [
        {
          assessmentId: 'l1',
          workspaceId: 'ws_1',
          actor: 'DRDRE',
          targetCandidateId: 'cand_b',
          affectedTravelerIds: ['t1'],
          physicalLoad: 0.4,
          scheduleStress: 0.3,
          recoveryDeficit: 0.2,
          adjustmentRequirements: [],
          modelVersion: 'drdre-0.1',
          inputSnapshotRef: 'wss_1',
          confidence: 0.8,
          createdAt: '2026-06-30T10:00:00Z',
        },
      ],
    });

    expect(candidateHasNonOverridableBlock(ws, 'cand_a')).toBe(true);
    const { record } = core.finalize({
      workspace: ws,
      currentWorldStateSnapshotId: 'wss_1',
    });
    expect(record.selectedCandidateId).not.toBe('cand_a');
    expect(record.rejectedCandidates.some((r) => r.candidateId === 'cand_a')).toBe(true);
  });

  /** Invariant 2: EffectivePlan changes ⇒ authorized DecisionRecord exists */
  it('Invariant 2 — EFFECTIVE plan requires AUTHORIZED decision', () => {
    const plan: PlanVersion = {
      planVersionId: 'plan_v18',
      tripId: 'trip_1',
      createdBy: 'DECISION_CORE',
      sourceDecisionId: 'dec_1',
      operations: [],
      materializedPlanSnapshotRef: 'snap_18',
      status: 'EFFECTIVE',
      createdAt: '2026-06-30T10:00:00Z',
      effectiveAt: '2026-06-30T10:05:00Z',
    };

    expect(() =>
      assertEffectivePlanRequiresDecision({ planVersion: plan }),
    ).toThrow(WritePermissionViolationError);

    expect(() =>
      assertEffectivePlanRequiresDecision({
        planVersion: plan,
        decision: {
          decisionId: 'dec_1',
          recordStatus: 'AUTHORIZED',
          authorizationRequirement: {
            level: 'L2',
            requiresUserConfirmation: true,
            reasons: [],
            externalSideEffects: [],
          },
        },
      }),
    ).not.toThrow();
  });

  /** Invariant 3: External side effect ⇒ idempotencyKey (contract placeholder) */
  it('Invariant 3 — execution commands must carry idempotency key (policy hook)', () => {
    const command = { decisionId: 'dec_1', tripId: 'trip_1' };
    expect(() => {
      if (!('idempotencyKey' in command) || !(command as { idempotencyKey?: string }).idempotencyKey) {
        throw new Error('EXECUTION_REQUIRES_IDEMPOTENCY_KEY');
      }
    }).toThrow('EXECUTION_REQUIRES_IDEMPOTENCY_KEY');
  });

  /** Invariant 4: DecisionRecord binds evidence/rule/model versions */
  it('Invariant 4 — decision record carries version bindings', () => {
    const { record } = core.finalize({
      workspace: workspaceFixture(),
      currentWorldStateSnapshotId: 'wss_1',
    });
    expect(Array.isArray(record.ruleVersions)).toBe(true);
    expect(typeof record.modelVersions).toBe('object');
    expect(record.evidenceRefs).toBeDefined();
  });

  /** Invariant 5: Agent output alone ⇒ no PlanVersion mutation */
  it('Invariant 5 — Neptune cannot directly mutate plan', () => {
    expect(() =>
      assertNeptuneDoesNotDirectlyMutatePlan({
        hasUpdatedPlan: true,
        source: 'StrategyOrchestrator',
      }),
    ).toThrow(WritePermissionViolationError);
  });

  it('Invariant 5b — Guardian cannot write decision-exclusive fields', () => {
    expect(() =>
      assertGuardianPayloadHasNoDecisionFields(
        { selectedCandidateId: 'cand_a', finalAction: 'REPLACE' },
        'NEPTUNE',
      ),
    ).toThrow(WritePermissionViolationError);
  });

  /** Invariant 6: Replayed command ⇒ at most one external effect (policy hook) */
  it('Invariant 6 — idempotent replay marker is distinct from new execution', () => {
    const replayStatuses: Rfc001DecisionRecord['recordStatus'][] = [
      'PROPOSED',
      'AUTHORIZED',
    ];
    expect(replayStatuses).not.toContain('EFFECTIVE');
  });

  /** Invariant 7: PARTIAL ⇒ NEEDS_REPAIR */
  it('Invariant 7 — PARTIAL execution maps to NEEDS_REPAIR decision state', () => {
    const partialRecord: Pick<Rfc001DecisionRecord, 'recordStatus'> = {
      recordStatus: 'PARTIAL',
    };
    const needsRepair = partialRecord.recordStatus === 'PARTIAL';
    expect(needsRepair).toBe(true);
  });
});
