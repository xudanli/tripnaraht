import { projectTravelWorldState } from '../../state-learning/project-travel-world-state.util';
import {
  judgeTemporalScenarioReadiness,
  TEMPORAL_SCENARIO_DEFS,
} from '../pilot/scenario-temporal-readiness.util';
import {
  createTemporalThresholdProposal,
  reviewTemporalThresholdProposal,
  computeMetricDistribution,
} from '../pilot/readiness-distribution.util';
import {
  selectFirstQualifiedTemporalScenario,
  authorizeTemporalScenario,
} from './select-qualified-scenario.util';
import { getTemporalScenarioContract } from './temporal-scenario-contract.util';
import { projectTemporalImpactDeterministic } from './deterministic-projection.util';
import {
  assertTemporalImpactAsEvidenceOnly,
  assertTemporalImpactAsEvidenceOnlyOrThrow,
} from './temporal-impact.util';
import {
  evaluateTemporalProjection,
  checkTemporalQualityGate,
} from './temporal-evaluation.util';

describe('Temporal Scenario Graduation', () => {
  function unqualifiedJudgements() {
    return TEMPORAL_SCENARIO_DEFS.map((d) =>
      judgeTemporalScenarioReadiness({
        scenarioId: d.scenarioId,
        metricValues: {},
        approvedProposal: null,
      }),
    );
  }

  function qualifyPace() {
    const proposal = reviewTemporalThresholdProposal(
      createTemporalThresholdProposal({
        scenarioId: 'pace_day_sequence',
        distributions: [
          computeMetricDistribution('OUTCOME_OBSERVABILITY', [0.7, 0.8]),
          computeMetricDistribution('OBSERVATION_DENSITY', [5, 10]),
          computeMetricDistribution('TEMPORAL_COVERAGE', [0.5, 0.75]),
          computeMetricDistribution('HIGH_QUALITY_EPISODES', [10, 30]),
        ],
        usePercentile: 50,
        rationaleZh: 'pace 分布稳定',
      }),
      'APPROVED',
    );
    return TEMPORAL_SCENARIO_DEFS.map((d) =>
      judgeTemporalScenarioReadiness({
        scenarioId: d.scenarioId,
        metricValues: {
          OUTCOME_OBSERVABILITY: 0.95,
          OBSERVATION_DENSITY: 20,
          TEMPORAL_COVERAGE: 0.9,
          HIGH_QUALITY_EPISODES: 50,
          ATTRIBUTION: 0.9,
          WORLDSTATE_EVIDENCE_QUALITY: 0.9,
          CASE_REVIEW_COVERAGE: 0.9,
        },
        approvedProposal: d.scenarioId === 'pace_day_sequence' ? proposal : null,
      }),
    );
  }

  it('continues Pilot when no scenario QUALIFIED (no Temporal dev)', () => {
    const sel = selectFirstQualifiedTemporalScenario(unqualifiedJudgements());
    expect(sel.ok).toBe(false);
    if (!sel.ok) {
      expect(sel.action).toBe('CONTINUE_PILOT');
      expect(sel.temporalDevForbidden).toBe(true);
    }
    const auth = authorizeTemporalScenario({ selection: sel });
    expect(auth.authorized).toBe(false);
    expect(auth.mode).toBe('NONE');
  });

  it('Scenario Qualified ≠ Temporal Authorized until shadow grant', () => {
    const sel = selectFirstQualifiedTemporalScenario(qualifyPace());
    expect(sel.ok).toBe(true);
    if (!sel.ok) return;
    expect(sel.scenarioId).toBe('pace_day_sequence');
    expect(sel.scenarioQualifiedIsNotTemporalAuthorized).toBe(true);

    const notAuth = authorizeTemporalScenario({
      selection: sel,
      grantShadowAuthorization: false,
    });
    expect(notAuth.qualified).toBe(true);
    expect(notAuth.authorized).toBe(false);

    const shadow = authorizeTemporalScenario({
      selection: sel,
      grantShadowAuthorization: true,
    });
    expect(shadow.mode).toBe('SHADOW');
    expect(shadow.proactiveEnabled).toBe(false);

    const contract = getTemporalScenarioContract('pace_day_sequence');
    expect(contract.projectionMethod).toBe('DETERMINISTIC_RULE');
    expect(contract.visibilityDefault).toBe('SHADOW');
    expect(contract.forbiddenActions).toContain('bypass_harness_action');
  });

  it('deterministic Shadow projection emits TemporalImpact as evidence only', () => {
    const sel = selectFirstQualifiedTemporalScenario(qualifyPace());
    const auth = authorizeTemporalScenario({
      selection: sel,
      grantShadowAuthorization: true,
    });
    const ws = projectTravelWorldState({
      tripId: 't1',
      lifecycle: 'TRAVELING',
      tripMeta: { planVersion: 1 },
      correlation: { latestPlanVersion: 1 },
      plan: undefined as any,
    });
    /** enrich day summaries via decisionOs */
    const ws2 = projectTravelWorldState({
      tripId: 't1',
      lifecycle: 'TRAVELING',
      decisionOs: {
        revision: 'v1',
        tripId: 't1',
        days: [
          {
            date: '2026-08-11',
            items: [{ placeName: '满日程A' }, { placeName: '满日程B' }],
          },
        ],
      },
      tripMeta: { planVersion: 1 },
      correlation: { latestPlanVersion: 1 },
    });

    const impact = projectTemporalImpactDeterministic({
      auth,
      scenarioId: 'pace_day_sequence',
      worldState: ws2,
      evidence: [
        { key: 'fatigue', valueZh: '疲劳偏高', freshness: 'VERIFIED' },
        { key: 'pace', valueZh: 'packed 紧凑', freshness: 'VERIFIED' },
      ],
    });
    expect(impact.isPrediction).toBe(true);
    expect(impact.isDecision).toBe(false);
    expect(impact.visibility).toBe('SHADOW');
    expect(impact.mayTriggerAdjustment).toBe(false);
    expect(impact.direction).toBe('WORSENING');

    expect(
      assertTemporalImpactAsEvidenceOnly(impact, 'DECISION_RUNTIME_EVIDENCE').ok,
    ).toBe(true);
    expect(
      assertTemporalImpactAsEvidenceOnly(impact, 'DIRECT_ACTION').ok,
    ).toBe(false);
    expect(() =>
      assertTemporalImpactAsEvidenceOnlyOrThrow(impact, 'AUTO_REPLAN'),
    ).toThrow(/TEMPORAL_CANNOT_FORM_ACTION/);

    void ws;
  });

  it('TemporalEvaluation + Quality Gate prove Shadow prediction quality (DoD)', () => {
    const sel = selectFirstQualifiedTemporalScenario(qualifyPace());
    const auth = authorizeTemporalScenario({
      selection: sel,
      grantShadowAuthorization: true,
    });
    const ws = projectTravelWorldState({
      tripId: 't1',
      lifecycle: 'TRAVELING',
      tripMeta: { planVersion: 1 },
      correlation: { latestPlanVersion: 1 },
    });

    const evals = Array.from({ length: 5 }, (_, i) => {
      const impact = projectTemporalImpactDeterministic({
        auth,
        scenarioId: 'pace_day_sequence',
        worldState: ws,
        evidence: [
          { key: 'fatigue', valueZh: '疲劳', freshness: 'VERIFIED' },
          { key: 'pace', valueZh: 'packed', freshness: 'VERIFIED' },
        ],
      });
      return evaluateTemporalProjection({
        impact,
        observed: {
          deteriorated: true,
          onsetHours: (impact.onsetHours ?? 12) + (i % 2),
          deadlineHours: impact.deadlineHours ?? 36,
          observedDirection: 'WORSENING',
        },
      });
    });

    const gate = checkTemporalQualityGate({
      evaluations: evals,
      minSamples: 5,
    });
    expect(gate.proactiveStillClosed).toBe(true);
    expect(gate.passed).toBe(true);
    expect(gate.allowUserVisibleTemporal).toBe(true);

    const visible = authorizeTemporalScenario({
      selection: sel,
      grantShadowAuthorization: true,
      temporalQualityGatePassed: true,
    });
    expect(visible.mode).toBe('USER_VISIBLE_TEMPORAL');
    expect(visible.proactiveEnabled).toBe(false);
  });
});
