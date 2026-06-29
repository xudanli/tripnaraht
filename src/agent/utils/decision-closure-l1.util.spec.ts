/**
 * L1 UI 辅助函数单元测试。
 */
import {
  formatRejectedPlanStatus,
  formatScorePct,
  hasAlternativesRows,
  hasDecisionVerdictCard,
  hasRejectedPlansRows,
  resolveChosenAlternativeId,
  roadBannerText,
  shouldShowRoadBanner,
  sortAlternativesForDisplay,
} from './decision-closure-l1.util';

describe('decision-closure-l1.util', () => {
  it('shouldShowRoadBanner respects applied_events gate', () => {
    expect(shouldShowRoadBanner(undefined)).toBe(false);
    expect(
      shouldShowRoadBanner({ applied_events: 0, road_ids: ['F208'], weather_dates: [] }),
    ).toBe(false);
    expect(
      shouldShowRoadBanner({ applied_events: 2, road_ids: ['F208'], weather_dates: ['2026-01-16'] }),
    ).toBe(true);
  });

  it('roadBannerText formats zh copy', () => {
    const t = roadBannerText({
      applied_events: 2,
      road_ids: ['F208'],
      weather_dates: ['2026-01-16'],
    });
    expect(t).toContain('F208');
    expect(t).toContain('2026-01-16');
  });

  it('hasDecisionVerdictCard requires narration', () => {
    expect(hasDecisionVerdictCard({})).toBe(false);
    expect(hasDecisionVerdictCard({ decision_verdict_narration_zh: '  x  ' })).toBe(true);
  });

  it('hasRejectedPlansRows counts rejected_plans', () => {
    expect(hasRejectedPlansRows(undefined)).toBe(false);
    expect(hasRejectedPlansRows({ rejected_plans: [] })).toBe(false);
    expect(hasRejectedPlansRows({ rejected_plans: [{ id: 'base' }] })).toBe(true);
  });

  it('resolveChosenAlternativeId prefers verdict chosen_plan_id', () => {
    expect(
      resolveChosenAlternativeId({
        recommended_alternative_id: 'a',
        decision_verdict: { chosen_plan_id: 'b' },
      }),
    ).toBe('b');
  });

  it('sortAlternativesForDisplay orders by score desc', () => {
    const sorted = sortAlternativesForDisplay([
      { id: 'low', score: 0.1 },
      { id: 'high', score: 0.9 },
    ]);
    expect(sorted[0].id).toBe('high');
  });

  it('formatScorePct renders percentage', () => {
    expect(formatScorePct(0.825)).toBe('82.5%');
    expect(formatRejectedPlanStatus('infeasible')).toBe('不可行');
  });

  it('hasAlternativesRows', () => {
    expect(hasAlternativesRows([])).toBe(false);
    expect(hasAlternativesRows([{ id: 'x' }])).toBe(true);
  });
});
