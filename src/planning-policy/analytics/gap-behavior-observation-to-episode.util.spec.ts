import { buildGapBehaviorObservation } from '../utils/build-gap-behavior-observation.util';
import type { RetrievalDecisionTrace } from '../types/retrieval-decision-trace.types';
import { buildGapBehaviorDriftReport } from './gap-behavior-drift.util';
import {
  gapBehaviorObservationLoosePayloadToEpisodeRecord,
  gapBehaviorObservationToEpisodeRecord,
} from './gap-behavior-observation-to-episode.util';

describe('gap-behavior-observation-to-episode.util', () => {
  it('maps strict observation to episode and aggregates in drift report', () => {
    const trace = {
      retrievalKind: 'planning',
      query: 'q',
      contextualSignals: {},
      penalties: { rejected: [], selected: [], diversity: [] },
      gapStats: { primaryGap: 'MISSING_RAIN_FALLBACK', allGaps: ['MISSING_RAIN_FALLBACK'] },
    } as RetrievalDecisionTrace;
    const obs = buildGapBehaviorObservation({
      trace,
      selectedPois: [{ category: 'SPA' }, { category: 'MUSEUM' }],
    });
    expect(obs).toBeDefined();
    const ep = gapBehaviorObservationToEpisodeRecord(obs!, {
      eveningLikeSelectedCount: 1,
      morningLikeSelectedCount: 1,
    });
    expect(ep.primaryGap).toBe('MISSING_RAIN_FALLBACK');
    expect(ep.selectedCount).toBe(2);
    expect(ep.eveningLikeSelectedCount).toBe(1);
    const report = buildGapBehaviorDriftReport({ episodes: [ep] });
    expect(report.cohorts[0]?.meanSelectedCount).toBe(2);
    expect(report.cohorts[0]?.meanEveningSlotShare).toBeCloseTo(0.5, 5);
  });

  it('parses snake_case loose payload', () => {
    const ep = gapBehaviorObservationLoosePayloadToEpisodeRecord({
      ts: '2026-01-05T12:00:00.000Z',
      primary_gap: 'OVER_DENSE_DAY',
      all_gap_types: ['OVER_DENSE_DAY', 'LACK_LOCAL_FOOD'],
      selected_count: 3,
      indoorish_selected_count: 1,
      category_histogram: [
        { category: 'food', count: 2 },
        { category: 'RESTAURANT', count: 1 },
      ],
    });
    expect(ep?.primaryGap).toBe('OVER_DENSE_DAY');
    expect(ep?.allGapTypes).toEqual(['OVER_DENSE_DAY', 'LACK_LOCAL_FOOD']);
    expect(ep?.categoryHistogram).toEqual([
      { category: 'FOOD', count: 2 },
      { category: 'RESTAURANT', count: 1 },
    ]);
  });

  it('returns undefined for invalid gap', () => {
    expect(
      gapBehaviorObservationLoosePayloadToEpisodeRecord({
        primaryGap: 'NOT_A_REAL_GAP',
        selectedCount: 1,
        indoorishSelectedCount: 0,
        categoryHistogram: [],
      }),
    ).toBeUndefined();
  });

  it('clamps indoorish to selectedCount', () => {
    const ep = gapBehaviorObservationLoosePayloadToEpisodeRecord({
      primaryGap: 'INSUFFICIENT_REST',
      selectedCount: 2,
      indoorishSelectedCount: 99,
      categoryHistogram: [{ category: 'SPA', count: 2 }],
    });
    expect(ep?.indoorishSelectedCount).toBe(2);
  });
});
