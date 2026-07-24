import {
  computeIncrementalResearchScopes,
  deduplicateIncrementalScopes,
} from './compute-incremental-research-scopes.util';
import type { IncrementalResearchScope } from './compute-incremental-research-scopes.util';

describe('deduplicateIncrementalScopes', () => {
  it('removes duplicate domain+scopeId pairs', () => {
    const scopes: IncrementalResearchScope[] = [
      {
        domain: 'poi',
        scopeId: 'trip-1:day_1:poi',
        dayIndex: 1,
        invalidationType: 'FULL',
        reason: 'a',
      },
      {
        domain: 'poi',
        scopeId: 'trip-1:day_1:poi',
        dayIndex: 1,
        invalidationType: 'FULL',
        reason: 'b',
      },
    ];
    expect(deduplicateIncrementalScopes(scopes)).toHaveLength(1);
  });
});

describe('computeIncrementalResearchScopes edge cases', () => {
  it('returns empty when planDelta is empty', () => {
    const ctx = {
      tripId: 'trip-1',
      planDelta: [],
    } as Parameters<typeof computeIncrementalResearchScopes>[0];
    expect(computeIncrementalResearchScopes(ctx)).toEqual([]);
  });
});
