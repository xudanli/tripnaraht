import { mergeCognitionIntoNarration } from './merge-cognition-narration.util';

describe('mergeCognitionIntoNarration', () => {
  it('surfaces focused problem and future verification in tips/summary', () => {
    const out = mergeCognitionIntoNarration(
      { user_friendly_summary: '行程草案已生成。', day_by_day_narrative: [], highlights: [], tips: [] },
      {
        decisionDepth: 'FULL_SIMULATION',
        markers: ['REALITY_READY', 'PROBLEM_FOCUSED', 'FUTURE_SIMULATED'],
        focusedProblem: {
          schema: 'tripnara/focused-decision-problem@v1',
          problemId: 'focus_wind',
          type: 'RISK',
          question: '是否继续经过高风暴露路段？',
          rootCause: { evidenceRefs: ['ew'], detail: 'wind' },
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
          builtAt: new Date().toISOString(),
          baseline: { id: 'baseline', label: 'baseline' },
          alternatives: [{ id: 'alt_bypass', label: '绕行低风走廊' }],
          comparison: {},
          recommendedAlternativeId: 'alt_bypass',
          verification: { status: 'NEED_CONFIRM', issues: [] },
        },
      },
    );

    expect(out.tips?.some((t) => t.includes('决策焦点'))).toBe(true);
    expect(out.tips?.some((t) => t.includes('绕行低风走廊'))).toBe(true);
    expect(out.warnings?.some((w) => String(w).includes('确认'))).toBe(true);
    expect(out.cognition_summary?.focused_problem_id).toBe('focus_wind');
    expect(out.cognition_summary?.recommended_alternative_id).toBe('alt_bypass');
    expect(out.user_friendly_summary).toContain('是否继续经过高风暴露路段');
  });
});
