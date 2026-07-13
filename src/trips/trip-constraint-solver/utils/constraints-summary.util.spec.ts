import {
  bumpConstraintsVersion,
  getConstraintsVersion,
  isConstraintsVersionConfirmed,
  applyConstraintsConfirm,
} from './constraints-metadata.util';
import {
  buildPendingItems,
  computeAllReady,
  resolveBudgetStatus,
  resolveEffectiveTravelMode,
  resolveTransportStatus,
  resolveTravelerCount,
  resolveTravelersStatus,
} from './constraints-summary.util';

describe('constraints-metadata.util', () => {
  it('bumps version and clears confirm fields', () => {
    const meta = applyConstraintsConfirm({ constraintsVersion: 1 }, 'u1');
    expect(isConstraintsVersionConfirmed(meta)).toBe(true);
    const bumped = bumpConstraintsVersion(meta);
    expect(getConstraintsVersion(bumped)).toBe(2);
    expect(bumped.constraintsConfirmedAt).toBeNull();
    expect(isConstraintsVersionConfirmed(bumped)).toBe(false);
  });
});

describe('constraints-summary.util', () => {
  it('resolves traveler count from pacingConfig first', () => {
    expect(
      resolveTravelerCount({
        pacingConfig: { travelers: [{}, {}, {}] },
        metadata: { travelers: [{}] },
      }),
    ).toBe(3);
  });

  it('flags budget REJECT as need_confirm', () => {
    expect(resolveBudgetStatus({ total: 1000, gateStatus: 'REJECT' })).toBe('need_confirm');
  });

  it('always confirms transport under self-drive-only scope', () => {
    expect(
      resolveTransportStatus({
        travelMode: 'DRIVING',
        sampleTravelMode: 'WALKING',
        sampleDistanceMeters: 18244,
      }),
    ).toBe('confirmed');
  });

  it('returns confirmed when transport mode matches', () => {
    expect(
      resolveTransportStatus({
        travelMode: 'DRIVING',
        sampleTravelMode: 'DRIVING',
        sampleDistanceMeters: 18244,
      }),
    ).toBe('confirmed');
  });

  it('returns confirmed when travelers count matches members', () => {
    expect(resolveTravelersStatus(2, 2)).toBe('confirmed');
  });

  it('defaults to DRIVING when pacingConfig is empty', () => {
    expect(resolveEffectiveTravelMode(null)).toBe('DRIVING');
  });

  it('infers DRIVING from transport car hint', () => {
    expect(resolveEffectiveTravelMode({ transport: 'car' })).toBe('DRIVING');
  });

  it('does not emit transport pending items', () => {
    const items = buildPendingItems({
      timeRange: { startDate: 'a', endDate: 'b', dayCount: 1, status: 'confirmed' },
      budget: { total: 1, currency: 'CNY', gateStatus: 'ALLOW', status: 'confirmed' },
      travelers: { count: 2, memberCount: 2, profilingCompletedCount: 0, status: 'confirmed' },
      transport: { status: 'missing' },
    });
    expect(items.find((i) => i.key === 'transport')).toBeUndefined();
  });

  it('builds pending items with labels', () => {
    const items = buildPendingItems({
      timeRange: { startDate: 'a', endDate: 'b', dayCount: 1, status: 'confirmed' },
      budget: { total: 1, currency: 'CNY', gateStatus: 'NEED_CONFIRM', status: 'need_confirm' },
      travelers: { count: 2, memberCount: 3, profilingCompletedCount: 0, status: 'misaligned' },
      transport: { status: 'confirmed' },
    });
    expect(items[0].label).toContain('预算');
    const travelersPending = items.find((i) => i.key === 'travelers');
    expect(travelersPending?.deepLink).toBe('openCollaborationCenter=1&section=members');
    expect(computeAllReady({
      timeRange: { startDate: 'a', endDate: 'b', dayCount: 1, status: 'confirmed' },
      budget: { total: 1, currency: 'CNY', gateStatus: 'ALLOW', status: 'confirmed' },
      travelers: { count: 2, memberCount: 2, profilingCompletedCount: 0, status: 'confirmed' },
    })).toBe(true);
  });
});
