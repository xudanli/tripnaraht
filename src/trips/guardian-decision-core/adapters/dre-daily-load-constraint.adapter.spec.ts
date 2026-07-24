import type { RoutePlanDraft } from '../../decision/shared/world-model.types';
import type { WorldStateAssertion } from '../contracts/world-state.types';
import type { DailyLoadAssertionPayload } from './daily-load-to-assertion.adapter';
import {
  evaluateDreDailyLoadConstraintForCandidate,
  DRDRE_DAILY_LOAD_RULE_VERSION,
} from './dre-daily-load-constraint.adapter';
import { ORIGINAL_CANDIDATE_ID } from './repair-candidate.adapter';
import { DAILY_LOAD_SPLIT_CANDIDATE_ID } from './dre-daily-load-repair-candidate.adapter';

function planWithDayHours(dayIndex: number, hours: number): RoutePlanDraft {
  const distanceKm = hours * 65;
  return {
    tripId: 'trip_load_pack',
    routeDirectionId: 'synthetic-IS',
    segments: [
      {
        segmentId: `seg_${dayIndex}`,
        dayIndex,
        distanceKm,
        ascentM: 0,
        slopePct: 0,
        metadata: { itineraryItemId: `item_d${dayIndex}` },
      },
    ],
  };
}

function loadAssertion(dayIndex: number, drivingHours: number, thresholdHours = 8) {
  return {
    assertionId: 'wsa_load_1',
    subjectRef: { kind: 'DAY' as const, id: `day_${dayIndex}` },
    predicate: 'daily.load',
    payload: { dayIndex, drivingHours, thresholdHours },
    source: { provider: 'plan_scan', sourceType: 'INTERNAL' as const, evidenceRefs: ['ev_1'] },
    observedAt: new Date().toISOString(),
    validFrom: new Date().toISOString(),
    validUntil: new Date(Date.now() + 86400000).toISOString(),
    confidence: 0.9,
    status: 'ACTIVE' as const,
    version: 1,
  } satisfies WorldStateAssertion<DailyLoadAssertionPayload>;
}

describe('dre-daily-load-constraint.adapter', () => {
  const prevPackRules = process.env.DECISION_PACK_RULES;

  afterEach(() => {
    if (prevPackRules === undefined) delete process.env.DECISION_PACK_RULES;
    else process.env.DECISION_PACK_RULES = prevPackRules;
  });

  it('LOAD-PACK-001: pack rules BLOCK original overloaded candidate', () => {
    process.env.DECISION_PACK_RULES = '1';
    const dayIndex = 1;
    const plan = planWithDayHours(dayIndex, 10);

    const result = evaluateDreDailyLoadConstraintForCandidate({
      tripId: 'trip_load_pack',
      workspaceId: 'ws_1',
      targetCandidateId: ORIGINAL_CANDIDATE_ID,
      loadAssertion: loadAssertion(dayIndex, 10),
      baselinePlan: plan,
      candidatePlan: plan,
      inputSnapshotRef: 'wss_1',
      affectedPlanItemIds: ['item_d1'],
      destinationCountry: 'IS',
    });

    expect(result.verdict).toBe('BLOCK');
    expect(result.constraintCode).toBe('DAILY_DRIVING_LOAD');
    expect(result.ruleVersion).toContain('IS_DAILY_LOAD_EXCESSIVE_BLOCK');
    expect(result.ruleVersion).toContain(DRDRE_DAILY_LOAD_RULE_VERSION);
  });

  it('LOAD-PACK-002: split candidate within threshold → PASS via route bypass', () => {
    process.env.DECISION_PACK_RULES = '1';
    const dayIndex = 1;
    const overloaded = planWithDayHours(dayIndex, 10);
    const relieved = planWithDayHours(dayIndex, 6);

    const result = evaluateDreDailyLoadConstraintForCandidate({
      tripId: 'trip_load_pack',
      workspaceId: 'ws_1',
      targetCandidateId: DAILY_LOAD_SPLIT_CANDIDATE_ID,
      loadAssertion: loadAssertion(dayIndex, 10),
      baselinePlan: overloaded,
      candidatePlan: relieved,
      inputSnapshotRef: 'wss_1',
      affectedPlanItemIds: ['item_d1'],
      destinationCountry: 'IS',
    });

    expect(result.verdict).toBe('PASS');
  });

  it('LOAD-PACK-003: inline fallback when pack rules disabled', () => {
    process.env.DECISION_PACK_RULES = '0';
    const dayIndex = 1;
    const plan = planWithDayHours(dayIndex, 10);

    const result = evaluateDreDailyLoadConstraintForCandidate({
      tripId: 'trip_load_pack',
      workspaceId: 'ws_1',
      targetCandidateId: ORIGINAL_CANDIDATE_ID,
      loadAssertion: loadAssertion(dayIndex, 10),
      baselinePlan: plan,
      candidatePlan: plan,
      inputSnapshotRef: 'wss_1',
      affectedPlanItemIds: ['item_d1'],
    });

    expect(result.verdict).toBe('BLOCK');
    expect(result.constraintCode).toBe('daily.driving.load');
  });
});
