import { buildCognitionUiCards } from './build-cognition-ui-cards.util';

describe('buildCognitionUiCards', () => {
  it('builds focused problem and authorization cards for cockpit UI', () => {
    const bundle = buildCognitionUiCards({
      decisionDepth: 'FULL_SIMULATION',
      markers: ['REALITY_READY', 'PROBLEM_FOCUSED', 'DECISION_AUTHORIZED'],
      realitySnapshot: {
        schema: 'tripnara/decision-reality-snapshot@v1',
        snapshotId: 'snap-1',
        builtAt: '2026-01-01T00:00:00.000Z',
        tripState: {},
        worldState: {},
        evidence: [],
        unknowns: [],
        freshness: { status: 'VALID' },
        confidence: 0.82,
      },
      focusedProblem: {
        schema: 'tripnara/focused-decision-problem@v1',
        problemId: 'focus_wind',
        type: 'RISK',
        question: '是否继续经过高风暴露路段？',
        rootCause: { evidenceRefs: [] },
        affectedScope: {},
        urgency: 'NOW',
        severity: 0.9,
        confidence: 0.8,
        whyThisProblem: '预测失败链是根因',
        suppressedSecondaryProblems: ['下午活动赶不上'],
        gateDisposition: 'NEED_CONFIRM',
      },
      futureSimulation: {
        schema: 'tripnara/future-simulation-bundle@v1',
        builtAt: '2026-01-01T00:00:00.000Z',
        baseline: { id: 'baseline', label: 'baseline' },
        alternatives: [{ id: 'alt_bypass', label: '绕行' }],
        comparison: {},
        recommendedAlternativeId: 'alt_bypass',
        verification: { status: 'NEED_CONFIRM', issues: [] },
      },
    });

    expect(bundle?.schema).toBe('tripnara.cognition_ui_cards@v1');
    expect(bundle?.cards.some((c) => c.kind === 'FOCUSED_PROBLEM')).toBe(true);
    expect(bundle?.cards.find((c) => c.kind === 'FOCUSED_PROBLEM')?.cta_zh).toBe('请确认后继续');
    expect(bundle?.cards.some((c) => c.kind === 'FUTURE')).toBe(true);
    expect(bundle?.cards.some((c) => c.ref === 'DECISION_AUTHORIZED')).toBe(true);
  });

  it('returns undefined when cognition is empty', () => {
    expect(buildCognitionUiCards(undefined)).toBeUndefined();
    expect(buildCognitionUiCards({})).toBeUndefined();
  });
});
