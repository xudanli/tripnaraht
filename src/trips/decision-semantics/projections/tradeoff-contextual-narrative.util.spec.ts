import type { FeasibilityIssueDto } from '../../trip-constraint-solver/types/trip-constraint-solver.types';
import {
  buildTradeoffContextualNarrative,
  enrichTradeoffsWithContextualNarratives,
  projectIssueTradeoffDimensionsForPersonaAlert,
} from './tradeoff-contextual-narrative.util';

describe('tradeoff-contextual-narrative.util', () => {
  it('builds SAFETY narrative with stale official rules and day/place context', () => {
    const issue: FeasibilityIssueDto = {
      id: 'issue-reynisfjara',
      priority: 'suggest_adjust',
      category: 'access_capacity',
      title: '雷尼斯黑沙滩 · 规则未核验',
      message: '官方潮汐/禁入规则已超过 14 天未核验',
      affectedDays: [2],
      severity: 'medium',
      anchors: { activityStartAt: '2026-08-02T14:30:00.000Z' },
      proofs: [
        {
          entity: 'POI-REYNISFJARA',
          placeLabel: '雷尼斯黑沙滩',
          constraint: 'tidal_access',
          currentFact: '官方潮汐/禁入规则已超过 14 天未核验',
          evidenceSource: 'Place.metadata',
          evidenceType: 'rule',
          conclusion: '需出发前再确认',
          observedAt: new Date(Date.now() - 14 * 86400000).toISOString(),
        },
      ],
    };

    const narrative = buildTradeoffContextualNarrative(
      {
        dimension: 'SAFETY',
        direction: 'WORSEN',
        explanation: '雷尼斯黑沙滩：官方规则已超过 14 天未核验',
      },
      { issue },
    );

    expect(narrative).toMatch(/Day 2 下午/);
    expect(narrative).toMatch(/雷尼斯黑沙滩/);
    expect(narrative).toMatch(/14 天未更新/);
    expect(narrative).toMatch(/建议出发前再确认/);
  });

  it('enriches TIME tradeoff with route and drive comparison context', () => {
    const issue: FeasibilityIssueDto = {
      id: 'issue-drive',
      priority: 'must_handle',
      category: 'transport',
      title: 'Day 2 驾驶超时',
      message: '驾驶超时',
      affectedDays: [2],
      severity: 'high',
      issueKind: 'daily_drive',
      anchors: {
        fromPlaceLabel: 'Patreksfjörður',
        toPlaceLabel: 'Ísafjörður',
        travelMinutes: 402,
        shortfallMinutes: 204,
      },
    };

    const enriched = enrichTradeoffsWithContextualNarratives(
      [
        {
          dimension: 'TIME',
          direction: 'IMPROVE',
          value: 198,
          unit: 'MINUTE',
          explanation: '原方案 6h42m → 调整后 3h18m',
        },
      ],
      {
        issue,
        placeNames: ['Patreksfjörður', 'Dýrafjörður', 'Ísafjörður'],
        optionTitle: '更换 Day 2 住宿',
      },
    );

    expect(enriched[0].contextualNarrative).toMatch(/Day 2/);
    expect(enriched[0].contextualNarrative).toMatch(/Patreksfjörður/);
    expect(enriched[0].contextualNarrative).toMatch(/更换 Day 2 住宿/);
  });

  it('projects persona alert tradeoff dimensions with contextual narratives', () => {
    const issue: FeasibilityIssueDto = {
      id: 'issue-pace',
      priority: 'suggest_adjust',
      category: 'schedule',
      title: '第 2 天行程偏紧',
      message: '当天步行与车程合计超过舒适阈值',
      affectedDays: [2],
      severity: 'medium',
      uiHints: { affectedMemberIds: ['M2'] },
    };

    const dims = projectIssueTradeoffDimensionsForPersonaAlert(issue);
    expect(dims.length).toBeGreaterThanOrEqual(2);
    expect(dims.some((d) => d.dimension === 'FLEXIBILITY' && d.contextualNarrative)).toBe(true);
    expect(dims.find((d) => d.dimension === 'FLEXIBILITY')?.contextualNarrative).toMatch(/M2/);
  });
});
