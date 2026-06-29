import {
  GLOBAL_SEGMENT_DISTANCE_THRESHOLDS,
  ICELAND_SEGMENT_DISTANCE_THRESHOLDS,
  applyMaxSegmentDistanceConstraintPatch,
  deriveWarnSegmentDistanceKm,
  ensureSegmentDistanceConstraints,
  longDistanceHighMessage,
  mergeSeededTripConstraints,
  resolveSegmentDistanceThresholds,
  seedDefaultTripConstraintsMetadata,
} from './segment-distance-threshold.util';

describe('segment-distance-threshold.util', () => {
  it('resolves global defaults when no user override or country pack', () => {
    const resolved = resolveSegmentDistanceThresholds({ destination: 'NZ', metadata: {} });
    expect(resolved.maxSegmentDistanceKm).toBe(GLOBAL_SEGMENT_DISTANCE_THRESHOLDS.maxSegmentDistanceKm);
    expect(resolved.warnSegmentDistanceKm).toBe(GLOBAL_SEGMENT_DISTANCE_THRESHOLDS.warnSegmentDistanceKm);
    expect(resolved.source).toBe('global_default');
  });

  it('uses Iceland country defaults', () => {
    const resolved = resolveSegmentDistanceThresholds({ destination: 'IS', metadata: {} });
    expect(resolved.maxSegmentDistanceKm).toBe(ICELAND_SEGMENT_DISTANCE_THRESHOLDS.maxSegmentDistanceKm);
    expect(resolved.warnSegmentDistanceKm).toBe(ICELAND_SEGMENT_DISTANCE_THRESHOLDS.warnSegmentDistanceKm);
    expect(resolved.source).toBe('country_default');
  });

  it('user maxSegmentDistanceKm overrides country default', () => {
    const resolved = resolveSegmentDistanceThresholds({
      destination: 'IS',
      metadata: { constraints: { maxSegmentDistanceKm: 180 } },
    });
    expect(resolved.maxSegmentDistanceKm).toBe(180);
    expect(resolved.source).toBe('user');
  });

  it('builds dynamic hazard messages from threshold', () => {
    expect(longDistanceHighMessage(250)).toContain('>250km');
  });

  it('seeds Iceland defaults into metadata.constraints', () => {
    const metadata: Record<string, unknown> = {};
    mergeSeededTripConstraints('IS', metadata);
    expect(metadata.constraints).toEqual({
      maxSegmentDistanceKm: 250,
      warnSegmentDistanceKm: 150,
    });
  });

  it('does not seed when user already set maxSegmentDistanceKm', () => {
    expect(
      seedDefaultTripConstraintsMetadata('IS', { maxSegmentDistanceKm: 400 }),
    ).toBeUndefined();
  });

  it('derives warn from country ratio when PATCH only max', () => {
    expect(deriveWarnSegmentDistanceKm(350, 'IS')).toBe(210);
    expect(deriveWarnSegmentDistanceKm(300, 'NZ')).toBe(200);
  });

  it('applyMaxSegmentDistanceConstraintPatch writes max and derived warn', () => {
    const constraints: Record<string, unknown> = {};
    applyMaxSegmentDistanceConstraintPatch(constraints, {
      value: 350,
      destination: 'IS',
    });
    expect(constraints).toEqual({ maxSegmentDistanceKm: 350, warnSegmentDistanceKm: 210 });
  });

  it('applyMaxSegmentDistanceConstraintPatch respects explicit warn via tolerance', () => {
    const constraints: Record<string, unknown> = {};
    applyMaxSegmentDistanceConstraintPatch(constraints, {
      value: 350,
      tolerance: 180,
      destination: 'IS',
    });
    expect(constraints.warnSegmentDistanceKm).toBe(180);
  });

  it('ensureSegmentDistanceConstraints backfills Iceland defaults', () => {
    const metadata: Record<string, unknown> = {};
    expect(ensureSegmentDistanceConstraints('IS', metadata)).toBe(true);
    expect(metadata.constraints).toEqual({
      maxSegmentDistanceKm: 250,
      warnSegmentDistanceKm: 150,
    });
  });

  it('ensureSegmentDistanceConstraints adds warn when only max exists', () => {
    const metadata = { constraints: { maxSegmentDistanceKm: 400 } };
    expect(ensureSegmentDistanceConstraints('IS', metadata)).toBe(true);
    expect((metadata.constraints as Record<string, unknown>).warnSegmentDistanceKm).toBe(240);
  });
});
