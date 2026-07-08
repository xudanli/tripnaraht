import { bumpConstraintsVersion } from './constraints-metadata.util';
import { buildPlanningConflictsCacheKey } from './planning-conflicts-cache-key.util';

describe('planning-conflicts-cache-key.util', () => {
  const updatedAt = new Date('2026-06-30T00:00:00Z');

  it('includes constraintsVersion so constraint patch invalidates cache', () => {
    const v1 = buildPlanningConflictsCacheKey({
      updatedAt,
      metadata: { revision: 12, constraintsVersion: 3 },
    });
    const bumped = bumpConstraintsVersion({
      revision: 12,
      constraintsVersion: 3,
      constraints: { maxSegmentDistanceKm: 380 },
    });
    const v2 = buildPlanningConflictsCacheKey({ updatedAt, metadata: bumped });

    expect(v1).toBe('12:cv3');
    expect(v2).toBe('12:cv4');
    expect(v1).not.toBe(v2);
  });

  it('defaults constraintsVersion to 0 when absent', () => {
    expect(buildPlanningConflictsCacheKey({ updatedAt, metadata: { revision: 5 } })).toBe('5:cv0');
  });
});
