import { evaluateAbuRoadConstraintForCandidate } from './abu-road-constraint.adapter';
import { roadStatusChangedToAssertion } from './road-status-to-assertion.adapter';
import { ORIGINAL_CANDIDATE_ID, buildRoadCloseStubCandidates, planForCandidate } from './repair-candidate.adapter';
import { RFC001_REASON_CODES } from '../reason-codes/reason-code.registry';
import type { RoutePlanDraft } from '../../decision/shared/world-model.types';
import type { Rfc001DecisionProblem } from '../contracts/decision-problem.types';
import type { RoadCloseImpactResult } from '../detection/road-close-impact.types';

function closedAssertion(tripId: string, opts?: { validUntil?: string; status?: 'CLOSED' | 'LIMITED' | 'UNKNOWN' }) {
  const observedAt = '2026-06-30T10:00:00Z';
  const a = roadStatusChangedToAssertion({
    tripId,
    roadId: 'F208',
    status: opts?.status ?? 'CLOSED',
    evidenceRef: 'ev_test',
    sourceProvider: 'admin_injection',
    observedAt,
    confidence: 0.95,
  });
  if (opts?.validUntil) {
    return { ...a, validUntil: opts.validUntil };
  }
  return a;
}

function minimalPlan(): RoutePlanDraft {
  return {
    tripId: 'trip_abu',
    segments: [
      {
        segmentId: 'seg_drive',
        metadata: { itineraryItemId: 'item_drive' },
      },
    ],
  };
}

const bindings = {
  byItemId: { item_drive: ['F208'] },
};

const impact: RoadCloseImpactResult = {
  roadId: 'F208',
  matchedSegmentIds: ['seg_drive'],
  affectedPlanItemIds: ['item_drive'],
  downstreamPlanItemIds: [],
};

const problem = {
  problemId: 'prob_1',
  planVersionId: 'plan_v17',
} as Rfc001DecisionProblem;

describe('abu-road-constraint.adapter (WP2)', () => {
  it('ABU-ROAD-001: original on CLOSED road → BLOCK non-overridable', () => {
    const plan = minimalPlan();
    const result = evaluateAbuRoadConstraintForCandidate({
      tripId: 'trip_abu',
      workspaceId: 'ws_1',
      targetCandidateId: ORIGINAL_CANDIDATE_ID,
      roadAssertion: closedAssertion('trip_abu'),
      affectedPlanItemIds: impact.affectedPlanItemIds,
      candidatePlan: plan,
      bindings,
      now: new Date('2026-06-30T10:05:00Z'),
    });
    expect(result.verdict).toBe('BLOCK');
    expect(result.overridable).toBe(false);
    expect(result.reasonCodes).toContain(RFC001_REASON_CODES.ROAD_SEGMENT_CLOSED);
  });

  it('ABU-ROAD-002: bypass candidate (cand_c) → PASS', () => {
    const plan = minimalPlan();
    const candidates = buildRoadCloseStubCandidates({
      workspaceId: 'ws_1',
      problem,
      impact,
      basePlan: plan,
    });
    const candC = candidates.find((c) => c.candidateId === 'cand_c')!;
    const repaired = planForCandidate(plan, candC);

    const result = evaluateAbuRoadConstraintForCandidate({
      tripId: 'trip_abu',
      workspaceId: 'ws_1',
      targetCandidateId: 'cand_c',
      roadAssertion: closedAssertion('trip_abu'),
      affectedPlanItemIds: impact.affectedPlanItemIds,
      candidatePlan: repaired,
      bindings,
      now: new Date('2026-06-30T10:05:00Z'),
    });
    expect(result.verdict).toBe('PASS');
    expect(result.constraintCode).toBe('ROAD_BYPASS');
  });

  it('ABU-ROAD-003: LIMITED on affected route → WARNING overridable', () => {
    const plan = minimalPlan();
    const result = evaluateAbuRoadConstraintForCandidate({
      tripId: 'trip_abu',
      workspaceId: 'ws_1',
      targetCandidateId: ORIGINAL_CANDIDATE_ID,
      roadAssertion: closedAssertion('trip_abu', { status: 'LIMITED' }),
      affectedPlanItemIds: impact.affectedPlanItemIds,
      candidatePlan: plan,
      bindings,
      now: new Date('2026-06-30T10:05:00Z'),
    });
    expect(result.verdict).toBe('WARNING');
    expect(result.overridable).toBe(true);
    expect(result.reasonCodes).toContain(RFC001_REASON_CODES.ROAD_SEGMENT_RESTRICTED);
  });

  it('ABU-ROAD-004: expired evidence → UNKNOWN EVIDENCE_STALE', () => {
    const plan = minimalPlan();
    const result = evaluateAbuRoadConstraintForCandidate({
      tripId: 'trip_abu',
      workspaceId: 'ws_1',
      targetCandidateId: ORIGINAL_CANDIDATE_ID,
      roadAssertion: closedAssertion('trip_abu', {
        validUntil: '2026-06-30T09:00:00Z',
      }),
      affectedPlanItemIds: impact.affectedPlanItemIds,
      candidatePlan: plan,
      bindings,
      now: new Date('2026-06-30T10:05:00Z'),
    });
    expect(result.verdict).toBe('UNKNOWN');
    expect(result.reasonCodes).toContain(RFC001_REASON_CODES.EVIDENCE_STALE);
  });

  it('ABU-ROAD-005: conflicting evidence → UNKNOWN EVIDENCE_CONFLICT', () => {
    const plan = minimalPlan();
    const primary = closedAssertion('trip_abu');
    const conflict = closedAssertion('trip_abu', { status: 'OPEN' });
    const result = evaluateAbuRoadConstraintForCandidate({
      tripId: 'trip_abu',
      workspaceId: 'ws_1',
      targetCandidateId: ORIGINAL_CANDIDATE_ID,
      roadAssertion: primary,
      conflictingAssertion: { ...conflict, status: 'DISPUTED' },
      affectedPlanItemIds: impact.affectedPlanItemIds,
      candidatePlan: plan,
      bindings,
      now: new Date('2026-06-30T10:05:00Z'),
    });
    expect(result.verdict).toBe('UNKNOWN');
    expect(result.reasonCodes).toContain(RFC001_REASON_CODES.EVIDENCE_CONFLICT);
  });

  describe('with DECISION_PACK_RULES=1', () => {
    const prev = process.env.DECISION_PACK_RULES;

    beforeEach(() => {
      process.env.DECISION_PACK_RULES = '1';
    });

    afterEach(() => {
      if (prev === undefined) delete process.env.DECISION_PACK_RULES;
      else process.env.DECISION_PACK_RULES = prev;
    });

    it('ABU-ROAD-006: pack rules mirror inline CLOSED → BLOCK', () => {
      const plan = minimalPlan();
      const result = evaluateAbuRoadConstraintForCandidate({
        tripId: 'trip_abu',
        workspaceId: 'ws_1',
        targetCandidateId: ORIGINAL_CANDIDATE_ID,
        roadAssertion: closedAssertion('trip_abu'),
        affectedPlanItemIds: impact.affectedPlanItemIds,
        candidatePlan: plan,
        bindings,
        destinationCountry: 'IS',
        now: new Date('2026-06-30T10:05:00Z'),
      });
      expect(result.verdict).toBe('BLOCK');
      expect(result.ruleVersion).toContain('pack:IS_ROAD_CLOSED_BLOCK');
    });
  });
});
