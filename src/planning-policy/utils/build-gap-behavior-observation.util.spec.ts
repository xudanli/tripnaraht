import { buildGapBehaviorObservation } from './build-gap-behavior-observation.util';
import type { RetrievalDecisionTrace } from '../types/retrieval-decision-trace.types';

describe('build-gap-behavior-observation.util', () => {
  it('returns undefined when trace has no gapStats', () => {
    expect(
      buildGapBehaviorObservation({
        trace: { retrievalKind: 'planning', query: '', contextualSignals: {}, penalties: { rejected: [], selected: [], diversity: [] } } as RetrievalDecisionTrace,
        selectedPois: [{ name: 'X', category: 'MUSEUM' }],
      }),
    ).toBeUndefined();
  });

  it('builds observation from gapStats and selected POIs', () => {
    const trace = {
      retrievalKind: 'planning',
      query: 'q',
      contextualSignals: {},
      penalties: { rejected: [], selected: [], diversity: [] },
      gapStats: { primaryGap: 'MISSING_RAIN_FALLBACK', allGaps: ['MISSING_RAIN_FALLBACK', 'LACK_LOCAL_FOOD'] },
    } as RetrievalDecisionTrace;
    const obs = buildGapBehaviorObservation({
      trace,
      selectedPois: [
        { name: 'City Museum', category: 'MUSEUM' },
        { name: 'Outdoor trail', category: 'ATTRACTION' },
      ],
    });
    expect(obs?.primaryGap).toBe('MISSING_RAIN_FALLBACK');
    expect(obs?.allGapTypes).toEqual(['MISSING_RAIN_FALLBACK', 'LACK_LOCAL_FOOD']);
    expect(obs?.selectedCount).toBe(2);
    expect(obs?.indoorishSelectedCount).toBeGreaterThanOrEqual(1);
    expect(obs?.categoryHistogram.length).toBeGreaterThan(0);
  });

  it('falls back allGapTypes to [primaryGap] when gapStats has no allGaps', () => {
    const trace = {
      retrievalKind: 'replacement',
      query: 'q',
      contextualSignals: {},
      penalties: { rejected: [], selected: [], diversity: [] },
      gapStats: { primaryGap: 'OVER_DENSE_DAY' },
    } as RetrievalDecisionTrace;
    const obs = buildGapBehaviorObservation({ trace, selectedPois: [{ category: 'SPA' }] });
    expect(obs?.allGapTypes).toEqual(['OVER_DENSE_DAY']);
  });
});
