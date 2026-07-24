import {
  assertAuthorizationNotExpired,
  assertBasePlanVersionOptimisticLock,
  assertEffectivePlanVersionConsistency,
  assertWorldStateSnapshotFreshness,
  PlanVersionPreExecuteGuardError,
} from './plan-version-preexecute.guard';
import { roadStatusChangedToAssertion } from '../adapters/road-status-to-assertion.adapter';
import type { Rfc001DecisionRecord } from '../contracts/decision-record.types';
import type { PlanVersion } from '../contracts/plan-version.types';
import { RFC001_AUTHORIZATION_VALIDITY_MS } from '../config/rfc001-iceland.config';

function baseRecord(overrides: Partial<Rfc001DecisionRecord> = {}): Rfc001DecisionRecord {
  return {
    decisionId: 'dec_1',
    problemId: 'prob_1',
    workspaceId: 'ws_1',
    basePlanVersionId: 'plan_v17',
    worldStateSnapshotId: 'wss_1',
    preferenceSnapshotId: 'pref_1',
    consideredCandidateIds: ['cand_a'],
    rejectedCandidates: [],
    selectedCandidateId: 'cand_a',
    finalAction: 'REPLACE',
    reasonCodes: [],
    evidenceRefs: [],
    authorizationRequirement: {
      level: 'L2',
      requiresUserConfirmation: true,
      reasons: [],
      externalSideEffects: [],
    },
    ruleVersions: [],
    modelVersions: {},
    recordStatus: 'AUTHORIZED',
    createdAt: '2026-06-30T10:00:00Z',
    decidedAt: '2026-06-30T10:01:00Z',
    ...overrides,
  };
}

function basePlanVersion(overrides: Partial<PlanVersion> = {}): PlanVersion {
  return {
    planVersionId: 'plan_v18',
    tripId: 'trip_1',
    parentPlanVersionId: 'plan_v17',
    createdBy: 'DECISION_CORE',
    sourceDecisionId: 'dec_1',
    operations: [],
    materializedPlanSnapshotRef: 'snap_1',
    status: 'PENDING_AUTHORIZATION',
    createdAt: '2026-06-30T10:00:00Z',
    ...overrides,
  };
}

describe('plan-version-preexecute.guard (WP3)', () => {
  it('PRE-001: basePlanVersionId must match effective', () => {
    expect(() =>
      assertBasePlanVersionOptimisticLock({
        record: baseRecord({ basePlanVersionId: 'plan_v17' }),
        planVersion: basePlanVersion(),
        currentEffectivePlanVersionId: 'plan_v16',
        snapshotAssertions: [],
      }),
    ).toThrow(PlanVersionPreExecuteGuardError);
  });

  it('PRE-002: parent must match effective/base', () => {
    expect(() =>
      assertEffectivePlanVersionConsistency({
        record: baseRecord(),
        planVersion: basePlanVersion({ parentPlanVersionId: 'plan_v15' }),
        currentEffectivePlanVersionId: undefined,
        snapshotAssertions: [],
      }),
    ).toThrow(PlanVersionPreExecuteGuardError);
  });

  it('PRE-003: expired world state assertion blocks execute', () => {
    const assertion = roadStatusChangedToAssertion({
      tripId: 'trip_1',
      roadId: 'F208',
      status: 'CLOSED',
      evidenceRef: 'ev_1',
      sourceProvider: 'admin_injection',
      observedAt: '2026-06-30T08:00:00Z',
      confidence: 0.9,
    });
    expect(() =>
      assertWorldStateSnapshotFreshness({
        record: baseRecord(),
        planVersion: basePlanVersion(),
        worldStateSnapshot: { snapshotId: 'wss_1', assertionIds: [assertion.assertionId] },
        snapshotAssertions: [assertion],
        now: new Date('2026-06-30T10:00:00Z'),
      }),
    ).toThrow(PlanVersionPreExecuteGuardError);
  });

  it('PRE-004: authorization expiry blocks execute', () => {
    const staleDecidedAt = new Date(
      Date.now() - RFC001_AUTHORIZATION_VALIDITY_MS - 1000,
    ).toISOString();
    expect(() =>
      assertAuthorizationNotExpired({
        record: baseRecord({ decidedAt: staleDecidedAt }),
        planVersion: basePlanVersion(),
        snapshotAssertions: [],
        now: new Date(),
      }),
    ).toThrow(PlanVersionPreExecuteGuardError);
  });
});
