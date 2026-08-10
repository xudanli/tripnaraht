import { projectCgusDecisionTraceFromSearchResult } from './cgus-decision-trace.util';
import type { CGUSSearchResult } from './cgus-search.service';
import type { CgusDecisionTraceV1 } from './cgus-decision-trace.types';
import {
  applyCgusOutcomeWriteback,
  applyCgusTripReviewDiagnosis,
  applyCgusUserActionWriteback,
  CgusOutcomeLoopError,
  isCgusOverrideAloneInsufficient,
  isCgusWrongRecommendation,
  mayEvidenceUnfreezeEuUtility,
} from './cgus-decision-outcome-loop.util';

function baseTrace(): CgusDecisionTraceV1 {
  const result = {
    recommended: { id: 'A', plan: {} as any, constraintViolations: [], feasible: true },
    usedMonteCarlo: false,
    rankedCandidates: [
      {
        candidate: { id: 'A', plan: {} as any, constraintViolations: [], feasible: true },
        utility: 0.79,
        expectedUtility: 0.79,
        utilityBreakdown: { safety: 0.82, experience: 0.88, philosophy: 0.79, risk_penalty: 0.12 },
      },
      {
        candidate: { id: 'B', plan: {} as any, constraintViolations: [], feasible: true },
        utility: 0.73,
        expectedUtility: 0.73,
        utilityBreakdown: { safety: 0.91, experience: 0.55, philosophy: 0.68, risk_penalty: 0.04 },
      },
    ],
  } as CGUSSearchResult;

  return projectCgusDecisionTraceFromSearchResult({
    decision_id: 'trip1:OPTIMIZE:v1',
    trip_id: 'trip1',
    decision_type: 'OPTIMIZE',
    result,
  });
}

describe('CGUS Decision Outcome Loop', () => {
  it('ACCEPT sets chosen = recommended', () => {
    const t = applyCgusUserActionWriteback(baseTrace(), { user_action: 'ACCEPT' });
    expect(t.user_action).toBe('ACCEPT');
    expect(t.chosen_candidate).toBe('A');
    expect(t.recommended_candidate).toBe('A');
  });

  it('OVERRIDE keeps recommended and chosen separated', () => {
    const t = applyCgusUserActionWriteback(baseTrace(), {
      user_action: 'OVERRIDE',
      chosen_candidate: 'B',
      override_reason: '今天想多看海岸线',
    });
    expect(t.recommended_candidate).toBe('A');
    expect(t.chosen_candidate).toBe('B');
    expect(isCgusOverrideAloneInsufficient(t)).toBe(true);
  });

  it('rejects OVERRIDE when chosen equals recommended', () => {
    expect(() =>
      applyCgusUserActionWriteback(baseTrace(), {
        user_action: 'OVERRIDE',
        chosen_candidate: 'A',
      }),
    ).toThrow(CgusOutcomeLoopError);
  });

  it('REJECT_ALL clears chosen', () => {
    const t = applyCgusUserActionWriteback(baseTrace(), { user_action: 'REJECT_ALL' });
    expect(t.chosen_candidate).toBeUndefined();
  });

  it('Outcome and Regret are independent of Override', () => {
    let t = applyCgusUserActionWriteback(baseTrace(), {
      user_action: 'OVERRIDE',
      chosen_candidate: 'B',
    });
    t = applyCgusOutcomeWriteback(t, {
      actual_outcome: { completed: true, safetyIncident: false },
      decision_regret: 'NONE',
    });
    expect(t.user_action).toBe('OVERRIDE');
    expect(t.decision_regret).toBe('NONE');
    expect(isCgusWrongRecommendation(t)).toBe(false);
  });

  it('Trip Review YES requires root_cause; NONE only when not problematic', () => {
    const t = applyCgusUserActionWriteback(baseTrace(), { user_action: 'ACCEPT' });
    expect(() =>
      applyCgusTripReviewDiagnosis(t, {
        recommendation_problematic: 'YES',
        reviewed_by: 'ops@nara',
      }),
    ).toThrow(CgusOutcomeLoopError);

    const ok = applyCgusTripReviewDiagnosis(t, {
      recommendation_problematic: 'NO',
      reviewed_by: 'ops@nara',
      review_note: '正常',
    });
    expect(ok.root_cause).toBe('NONE');
  });

  it('Wrong Recommendation only for FEASIBILITY/UTILITY/WEIGHT with YES', () => {
    let t = applyCgusUserActionWriteback(baseTrace(), {
      user_action: 'OVERRIDE',
      chosen_candidate: 'B',
    });
    t = applyCgusOutcomeWriteback(t, {
      actual_outcome: { completed: true, safetyIncident: false },
      decision_regret: 'MEDIUM',
    });
    t = applyCgusTripReviewDiagnosis(t, {
      recommendation_problematic: 'YES',
      root_cause: 'UTILITY',
      reviewed_by: 'ops@nara',
      review_note: '体验价值被低估',
    });
    expect(isCgusWrongRecommendation(t)).toBe(true);
    expect(mayEvidenceUnfreezeEuUtility(t)).toBe(true);
    expect(isCgusOverrideAloneInsufficient(t)).toBe(false);
  });

  it('CAPABILITY_BOUNDARY is not Wrong Recommendation KPI', () => {
    let t = applyCgusUserActionWriteback(baseTrace(), {
      user_action: 'OVERRIDE',
      chosen_candidate: 'B',
    });
    t = applyCgusTripReviewDiagnosis(t, {
      recommendation_problematic: 'YES',
      root_cause: 'CAPABILITY_BOUNDARY',
      reviewed_by: 'ops@nara',
    });
    expect(isCgusWrongRecommendation(t)).toBe(false);
  });
});
