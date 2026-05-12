import {
  applyDiversityPenaltyToSortedRows,
  applySelectedPoiPenalty,
  normalizePoiDiversityTag,
  sortPoiScoreRowsDesc,
  type PoiScoreRow,
} from './poi-selection-diversity.util';

describe('poi-selection-diversity.util', () => {
  it('normalizePoiDiversityTag buckets by category and name heuristics', () => {
    expect(normalizePoiDiversityTag({ category: 'MUSEUM' })).toBe('MUSEUM');
    expect(normalizePoiDiversityTag({ name: 'Gullfoss waterfall' })).toBe('WATERFALL');
  });

  it('applies diversity penalty after third same-tag row in sorted order', () => {
    const mk = (name: string, score: number): PoiScoreRow => ({
      poi: { name, category: 'ATTRACTION' },
      idx: 0,
      localityScore: 0,
      openingHoursBonus: 0,
      dataCompletenessBonus: 0,
      riskPenalty: 0,
      score,
    });
    const rows: PoiScoreRow[] = [
      mk('A', 10),
      mk('B', 9),
      mk('C', 8),
    ];
    const penalized = applyDiversityPenaltyToSortedRows(rows);
    expect(penalized[0]!.score).toBe(10);
    expect(penalized[1]!.score).toBe(9);
    expect(penalized[2]!.score).toBeLessThan(8);
  });

  it('applySelectedPoiPenalty lowers score for already-selected ids', () => {
    const rows: PoiScoreRow[] = [
      {
        poi: { poi_id: '381112', name: 'X' },
        idx: 0,
        localityScore: 0,
        openingHoursBonus: 0,
        dataCompletenessBonus: 0,
        riskPenalty: 0,
        score: 5,
      },
    ];
    const out = sortPoiScoreRowsDesc(applySelectedPoiPenalty(rows, ['381112']));
    expect(out[0]!.score).toBeLessThan(5);
  });
});
