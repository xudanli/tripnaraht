import {
  deriveTodayReadinessStatus,
  filterCoverageMapForDay,
  findingAppliesToDay,
} from './today-readiness-filter.util';
import type { CoverageMapData } from '../types/coverage-map.types';

describe('today-readiness-filter.util', () => {
  const baseCoverage = (): CoverageMapData =>
    ({
      tripId: 't1',
      pois: [
        { id: 'p1', day: 1, name: 'A', coverageStatus: 'covered' },
        { id: 'p2', day: 2, name: 'B', coverageStatus: 'partial' },
      ],
      segments: [
        {
          id: 's1',
          fromPoiId: 'p1',
          toPoiId: 'p2',
          day: 1,
          coverageStatus: 'warning',
          duration: 60,
          hazards: [],
        },
      ],
      gaps: [
        { id: 'g1', type: 'poi', relatedId: 'p2', severity: 'high', message: 'gap', affectedDays: [2] },
      ],
      summary: {} as CoverageMapData['summary'],
    }) as CoverageMapData;

  it('filters coverage map to a single day', () => {
    const filtered = filterCoverageMapForDay(baseCoverage(), 2);
    expect(filtered.pois.map((p) => p.id)).toEqual(['p2']);
    expect(filtered.gaps.map((g) => g.id)).toEqual(['g1']);
  });

  it('excludes whole-trip pack findings without day scope', () => {
    expect(
      findingAppliesToDay(
        {
          id: 'visa',
          type: 'blocker',
          category: 'readiness',
          message: '需要签证',
          severity: 'high',
        },
        2,
      ),
    ).toBe(false);
  });

  it('keeps day-scoped transport findings', () => {
    expect(
      findingAppliesToDay(
        {
          id: 't1',
          type: 'must',
          category: 'transport',
          message: '第2天 · A → B · 路况',
          severity: 'medium',
          affectedDays: [2],
        },
        2,
      ),
    ).toBe(true);
  });

  it('derives status from blockers and score', () => {
    expect(deriveTodayReadinessStatus(1, 0, 90)).toBe('block');
    expect(deriveTodayReadinessStatus(0, 2, 65)).toBe('warn');
    expect(deriveTodayReadinessStatus(0, 0, 85)).toBe('pass');
  });
});
