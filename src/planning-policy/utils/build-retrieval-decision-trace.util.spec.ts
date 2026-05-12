import {
  annotateRetrievalTraceAfterPoiSelection,
  buildPlanningRetrievalDecisionTrace,
  buildReplacementRetrievalDecisionTrace,
} from './build-retrieval-decision-trace.util';
import type { PoiSearchContext } from '../types/poi-search-context.types';

describe('build-retrieval-decision-trace.util', () => {
  it('buildPlanningRetrievalDecisionTrace captures queries and penalties', () => {
    const ctx: PoiSearchContext = {
      destination: 'Reykjavik',
      rejectedPoiIds: ['bad'],
      selectedPoiIds: ['sel1'],
      pacing: 'relaxed',
      fatigueScore: 0.4,
    };
    const tr = buildPlanningRetrievalDecisionTrace({
      poiSearchCtx: ctx,
      scenicQuery: 's1',
      generalQuery: 'g1',
      extraSubQueries: { leg: 'x' },
      mergedPoiCount: 12,
    });
    expect(tr.retrievalKind).toBe('planning');
    expect(tr.subQueries?.scenic).toBe('s1');
    expect(tr.penalties.rejected).toEqual(['bad']);
    expect(tr.penalties.selected).toEqual(['sel1']);
    expect(tr.mergedPoiCount).toBe(12);
  });

  it('buildReplacementRetrievalDecisionTrace marks replacement kind', () => {
    const ctx: PoiSearchContext = { destination: 'Tokyo' };
    const tr = buildReplacementRetrievalDecisionTrace({
      poiSearchCtx: ctx,
      query: 'Tokyo attraction',
      hardRejectedIds: ['closed1', 'bad'],
      mergedPoiCount: 3,
      causedByEvent: { type: 'POI_CLOSED', poiId: 'closed1' },
    });
    expect(tr.retrievalKind).toBe('replacement');
    expect(tr.penalties.rejected).toEqual(['closed1', 'bad']);
    expect(tr.causedByEvent).toEqual({ type: 'POI_CLOSED', poiId: 'closed1' });
    expect(tr.retrievalReason).toMatch(/find_alternative/);
  });

  it('semanticGaps drive retrievalReason over default replacement intent', () => {
    const ctx: PoiSearchContext = { destination: 'IS' };
    const tr = buildReplacementRetrievalDecisionTrace({
      poiSearchCtx: ctx,
      query: 'q',
      hardRejectedIds: [],
      mergedPoiCount: 2,
      causedByEvent: { type: 'POI_CLOSED', poiId: 'x' },
      semanticGaps: [
        { type: 'MISSING_RELAXED_EVENING', severity: 0.7, causedByEvent: { type: 'POI_CLOSED', poiId: 'x' } },
      ],
    });
    expect(tr.retrievalReason).toBe(
      '[gap:MISSING_RELAXED_EVENING] fill_missing_relaxed_evening_experience',
    );
    expect(tr.semanticGaps?.[0]?.type).toBe('MISSING_RELAXED_EVENING');
    expect(tr.gapStats?.primaryGap).toBe('MISSING_RELAXED_EVENING');
    expect(tr.gapStats?.allGaps).toBeUndefined();
  });

  it('annotateRetrievalTraceAfterPoiSelection updates diversity and reason', () => {
    const tr = buildPlanningRetrievalDecisionTrace({
      poiSearchCtx: { destination: 'X' },
      scenicQuery: 'a',
      generalQuery: 'b',
      mergedPoiCount: 1,
    });
    annotateRetrievalTraceAfterPoiSelection(tr);
    expect(tr.retrievalReason).toMatch(/poi_selection/);
    expect(tr.penalties.diversity.some((x) => x.includes('applyDiversity'))).toBe(true);
  });

  it('gapStats.allGaps appears when multiple gap types present', () => {
    const tr = buildReplacementRetrievalDecisionTrace({
      poiSearchCtx: { destination: 'IS' },
      query: 'q',
      hardRejectedIds: [],
      mergedPoiCount: 1,
      semanticGaps: [
        { type: 'LACK_LOCAL_FOOD', severity: 0.5 },
        { type: 'OVER_DENSE_DAY', severity: 0.9 },
      ],
    });
    expect(tr.gapStats?.primaryGap).toBe('OVER_DENSE_DAY');
    expect(tr.gapStats?.allGaps).toEqual(['LACK_LOCAL_FOOD', 'OVER_DENSE_DAY']);
  });

  it('annotate preserves [gap:TYPE] prefix and is idempotent for ranking tag', () => {
    const tr = buildPlanningRetrievalDecisionTrace({
      poiSearchCtx: { destination: 'X' },
      scenicQuery: 'a',
      generalQuery: 'b',
      mergedPoiCount: 1,
      semanticGaps: [{ type: 'OVER_DENSE_DAY', severity: 0.9 }],
    });
    expect(tr.retrievalReason).toMatch(/^\[gap:OVER_DENSE_DAY\]/);
    annotateRetrievalTraceAfterPoiSelection(tr);
    const once = tr.retrievalReason ?? '';
    expect(once).toMatch(/^\[gap:OVER_DENSE_DAY\]/);
    expect(once).toMatch(/poi_selection/);
    annotateRetrievalTraceAfterPoiSelection(tr);
    expect(tr.retrievalReason).toBe(once);
  });
});
