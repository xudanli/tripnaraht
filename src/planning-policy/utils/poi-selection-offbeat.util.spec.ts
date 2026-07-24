import {
  applyOffBeatBoostToScoreRows,
  enforceOffBeatQuotaInTopN,
  isOffBeatResearchPoi,
} from './poi-selection-offbeat.util';
import type { PoiScoreRow } from './poi-selection-diversity.util';

describe('poi-selection-offbeat.util', () => {
  it('isOffBeatResearchPoi 识别标签与低热度', () => {
    expect(isOffBeatResearchPoi({ name: '西峡湾小众机位', rating: 4.8 })).toBe(true);
    expect(isOffBeatResearchPoi({ name: 'Popular Spot', popularity: 9 })).toBe(false);
  });

  it('applyOffBeatBoostToScoreRows 提升小众分数', () => {
    const rows: PoiScoreRow[] = [
      {
        poi: { name: 'Hidden Cove', rating: 3.5 },
        idx: 0,
        localityScore: 2,
        openingHoursBonus: 0,
        dataCompletenessBonus: 0,
        riskPenalty: 0,
        score: 2,
      },
    ];
    const boosted = applyOffBeatBoostToScoreRows(rows, true);
    expect(boosted[0].score).toBeGreaterThan(2);
    expect((boosted[0].poi as any).poi_planning_score_reasons).toContain('off_beaten_path_quota');
  });

  it('enforceOffBeatQuotaInTopN 替换热门项以满足 20%', () => {
    const popular = { id: 'p1', name: 'Top Attraction', popularity: 10 };
    const hidden = { id: 'h1', name: '秘境瀑布', popularity: 2 };
    const selected = [popular, popular, popular, popular, popular];
    const pool = [popular, hidden, { id: 'h2', name: 'local secret cafe', popularity: 1 }];
    const out = enforceOffBeatQuotaInTopN(selected, pool, 5, 0.2);
    const offBeat = out.filter((p) => isOffBeatResearchPoi(p as Record<string, unknown>));
    expect(offBeat.length).toBeGreaterThanOrEqual(1);
  });
});
