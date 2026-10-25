import { planLensesForProactiveCase } from '../lenses/evaluate-lens-activation.util';
import {
  rankProactiveCandidates,
  scoreProactiveCandidate,
  synthesizeProactiveRecommendation,
} from './synthesize-proactive-recommendation.util';
import { buildDefaultProactiveCandidates } from './build-default-proactive-candidates.util';
import { isProactiveDecisionCgusSearchEnabled } from '../config/proactive-decision-synthesis-flags.util';

describe('PD-5 Proactive CGUS-shaped synthesis', () => {
  it('recommends postpone for weather continue when Neptune available', () => {
    const lens = planLensesForProactiveCase({
      caseId: 'CASE_CONTINUE_ACTIVITY',
      signalKind: 'WEATHER_WIND',
      needAlternative: true,
    });
    const result = synthesizeProactiveRecommendation({
      caseId: 'CASE_CONTINUE_ACTIVITY',
      lens,
      impactZh: '下午黑沙滩风力增强，影响体验与安全。',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.synthesis.schemaId).toBe('nara.proactive_synthesis@v1');
    expect(result.synthesis.recommended.optionId).toBe(
      'OPT_POSTPONE_NEXT_WINDOW',
    );
    expect(result.synthesis.surfaceL3.suggestionZh).toContain('调整到下一可用窗口');
    expect(result.synthesis.surfaceL3.benefitsZh.length).toBeGreaterThan(0);
    expect(result.synthesis.confidence).toBeGreaterThan(0);
    expect(result.synthesis.improvement).toBeGreaterThan(0.3);
    expect(result.synthesis.actionability).toBeGreaterThan(0);
    expect(result.synthesis.lensActivated).toEqual(['ABU', 'DR_DRE', 'NEPTUNE']);
    expect(result.synthesis.hardGate.passed).toBe(true);
    expect(result.synthesis.rankingEngine).toBe('DETERMINISTIC_CGUS_SHAPED');
  });

  it('without Neptune still ranks keep vs postpone (Abu+Dre)', () => {
    const lens = planLensesForProactiveCase({
      caseId: 'CASE_CONTINUE_ACTIVITY',
      signalKind: 'WEATHER_WIND',
      needAlternative: false,
    });
    expect(lens.activateNeptune).toBe(false);
    const result = synthesizeProactiveRecommendation({
      caseId: 'CASE_CONTINUE_ACTIVITY',
      lens,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.synthesis.rankedOptions.length).toBe(2);
    expect(result.synthesis.recommended.optionId).toBe(
      'OPT_POSTPONE_NEXT_WINDOW',
    );
  });

  it('Hard Gate blocks KEEP_ORIGINAL when hardBlocked', () => {
    const lens = planLensesForProactiveCase({
      caseId: 'CASE_REROUTE',
      signalKind: 'ROAD_CLOSURE',
      mustRepair: true,
      hardBlocked: true,
    });
    const result = synthesizeProactiveRecommendation({
      caseId: 'CASE_REROUTE',
      lens,
      hardBlocked: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.synthesis.recommended.optionId).not.toBe('OPT_KEEP_ORIGINAL');
    expect(result.synthesis.recommended.optionId).toBe('OPT_REROUTE');
    expect(result.synthesis.hardGate.abuVerdict).toBe('HARD_BLOCK');
  });

  it('scores infeasible candidates below feasible ones', () => {
    const lens = planLensesForProactiveCase({
      caseId: 'CASE_CONTINUE_ACTIVITY',
      signalKind: 'WEATHER_WIND',
      needAlternative: true,
    });
    const candidates = buildDefaultProactiveCandidates({
      caseId: 'CASE_CONTINUE_ACTIVITY',
      lens,
      hardBlocked: true,
    });
    const ranked = rankProactiveCandidates(candidates);
    expect(ranked[0]?.feasible).toBe(true);
    expect(scoreProactiveCandidate(candidates[0]!)).toBeLessThan(0);
  });

  it('full CGUS search flag defaults off', () => {
    expect(
      isProactiveDecisionCgusSearchEnabled({
        PROACTIVE_DECISION_V1_ENABLED: '1',
      }),
    ).toBe(false);
    expect(
      isProactiveDecisionCgusSearchEnabled({
        PROACTIVE_DECISION_V1_ENABLED: '1',
        PROACTIVE_DECISION_CGUS_SEARCH_ENABLED: '1',
      }),
    ).toBe(true);
  });
});
