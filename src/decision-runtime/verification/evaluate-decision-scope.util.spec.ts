import { buildWindDecisionScope } from '../builders/build-wind-decision-scope';
import type { TravelWorldStateSnapshot } from '../contracts/world-state-snapshot';
import {
  DECISION_SCOPE_SNAPSHOT_MISMATCH,
  DECISION_SCOPE_VIOLATION,
  evaluateDecisionScopeBoundRun,
} from './evaluate-decision-scope.util';
import { CanonicalSolutionPostValidatorService } from '../optimization/post-validator.service';
import type { CanonicalConstraintReport } from '../constraints/contracts/canonical-constraint-report';

function stubSnapshot(): TravelWorldStateSnapshot {
  return {
    schemaId: 'tripnara.canonical_world_state_snapshot@v1',
    snapshotId: 'ws_wind_live_1',
    tripId: 'trip_is',
    revision: '1',
    createdAt: '2026-07-17T09:45:00.000Z',
    weather: [],
    roads: [{ roadId: '1', segmentId: 'seg_1', status: 'OPEN' }],
    hazards: [],
    ferries: [],
    poiStates: [],
    travelMatrix: { matrixId: 'm1', entries: [] },
    completeness: {
      weather: 'PARTIAL',
      roads: 'PARTIAL',
      hazards: 'MISSING',
      ferries: 'MISSING',
      openingHours: 'PARTIAL',
    },
    sourceVersions: [],
  };
}

function emptyFeasibleReport(tripId: string): CanonicalConstraintReport {
  return {
    schemaId: 'tripnara.canonical_constraint_report@v1',
    evaluationId: 'eval_test',
    tripId,
    evaluatedAt: new Date().toISOString(),
    assertions: [],
    completeness: {
      weather: 'PARTIAL',
      roads: 'PARTIAL',
      hazards: 'MISSING',
      ferries: 'MISSING',
      openingHours: 'PARTIAL',
    },
    overallStatus: 'FEASIBLE',
    degraded: false,
    degradedReasons: [],
  };
}

describe('evaluateDecisionScopeBoundRun (live Verification)', () => {
  it('passes when consumers share snapshotId and candidate in scope', () => {
    const scope = buildWindDecisionScope({
      snapshot: stubSnapshot(),
      activityId: 'act_glacier',
      segmentId: 'seg_1',
    });
    const result = evaluateDecisionScopeBoundRun({
      tripId: 'trip_is',
      scope,
      candidate: {
        actionType: 'DROP_STOP',
        targetObjectIds: ['stop:mid_waterfall'],
      },
    });
    expect(result.ok).toBe(true);
    expect(result.assertions).toHaveLength(0);
  });

  it('blocks snapshot mismatch', () => {
    const scope = buildWindDecisionScope({ snapshot: stubSnapshot() });
    const result = evaluateDecisionScopeBoundRun({
      tripId: 'trip_is',
      scope,
      consumers: [
        { name: 'decision', snapshotId: scope.snapshotId },
        { name: 'solver', snapshotId: 'ws_other' },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.assertions[0]?.reasonCode).toBe(DECISION_SCOPE_SNAPSHOT_MISMATCH);
  });

  it('blocks out-of-scope mutation', () => {
    const scope = buildWindDecisionScope({ snapshot: stubSnapshot() });
    const result = evaluateDecisionScopeBoundRun({
      tripId: 'trip_is',
      scope,
      candidate: {
        actionType: 'MOVE_DAY',
        targetObjectIds: ['act_glacier'],
      },
    });
    expect(result.ok).toBe(false);
    expect(result.assertions[0]?.reasonCode).toBe(DECISION_SCOPE_VIOLATION);
  });
});

describe('CanonicalSolutionPostValidatorService + DecisionScope', () => {
  const validator = new CanonicalSolutionPostValidatorService();

  it('fails closed on scope violation after solver', async () => {
    const snap = stubSnapshot();
    const scope = buildWindDecisionScope({ snapshot: snap });
    const result = await validator.validate({
      tripId: snap.tripId,
      snapshotId: snap.snapshotId,
      candidate: {
        candidateId: 'c1',
        label: 'drop stop',
        source: 'RULE_BASED_REPAIR',
        plan: { version: 't', createdAt: '', tripId: snap.tripId, days: [] },
        createdAt: snap.createdAt,
      },
      priorReport: emptyFeasibleReport(snap.tripId),
      decisionScope: scope,
      scopeMutationCandidate: {
        actionType: 'DIRECT_SET_EFFECTIVE',
        targetObjectIds: ['act_glacier'],
      },
    });
    expect(result.passed).toBe(false);
    expect(result.report.overallStatus).toBe('INFEASIBLE');
    expect(
      result.report.assertions.some((a) => a.reasonCode === DECISION_SCOPE_VIOLATION),
    ).toBe(true);
  });
});
