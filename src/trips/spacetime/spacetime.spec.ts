import {
  evaluateSpacetimeOverlay,
  executionInAnchorField,
  projectSpacetime,
  timeWindowContains,
} from './index';

describe('spacetime joint kernel (P28)', () => {
  const input = {
    spatialFacets: [
      {
        anchorId: 'a1',
        lat: 64.1,
        lng: -21.9,
        source: 'WEATHER' as const,
        confidence: 0.9,
      },
      {
        anchorId: 'a2',
        lat: 63.9,
        lng: -22.1,
        source: 'HOTEL' as const,
        confidence: 0.85,
      },
    ],
    temporalByAnchorId: {
      a1: { start: 1_000, end: 2_000 },
      a2: { start: 5_000, end: 9_000 },
    },
  };

  it('projectSpacetime joins spatial facets with temporal windows', () => {
    const anchors = projectSpacetime(input);
    expect(anchors).toHaveLength(2);
    expect(anchors[0]?.timeWindow).toEqual({ start: 1_000, end: 2_000 });
    expect(anchors[1]?.timeWindow).toEqual({ start: 5_000, end: 9_000 });
  });

  it('timeWindowContains is inclusive', () => {
    expect(timeWindowContains({ start: 10, end: 20 }, 10)).toBe(true);
    expect(timeWindowContains({ start: 10, end: 20 }, 20)).toBe(true);
    expect(timeWindowContains({ start: 10, end: 20 }, 9)).toBe(false);
  });

  it('executionInAnchorField gates on id + time', () => {
    const [w] = projectSpacetime(input);
    expect(
      executionInAnchorField(w!, {
        anchorId: 'a1',
        executionTimeMs: 1_500,
      }),
    ).toBe(true);
    expect(
      executionInAnchorField(w!, {
        anchorId: 'a1',
        executionTimeMs: 3_000,
      }),
    ).toBe(false);
  });

  it('evaluateSpacetimeOverlay surfaces window mismatch vs feasibility', () => {
    const anchors = projectSpacetime(input);
    expect(
      evaluateSpacetimeOverlay(anchors, { anchorId: 'a1', executionTimeMs: 1_500 }).feasibility,
    ).toBe('feasible');
    expect(
      evaluateSpacetimeOverlay(anchors, { anchorId: 'a1', executionTimeMs: 9_999 }).feasibility,
    ).toBe('window_mismatch');
    expect(
      evaluateSpacetimeOverlay(anchors, { anchorId: 'missing', executionTimeMs: 0 }).feasibility,
    ).toBe('anchor_unknown');
  });
});
