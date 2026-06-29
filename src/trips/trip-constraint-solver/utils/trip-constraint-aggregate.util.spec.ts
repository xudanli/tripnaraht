import {
  aggregateTripConstraints,
  classifyConstraintRefreshType,
  inferConflictConstraintIds,
  isLegacyConstraintId,
  resolveConstraintCardTone,
} from './trip-constraint-aggregate.util';
import {
  TRIP_CONSTRAINT_LEGACY_IDS,
  TRIP_CONSTRAINT_OFFICIAL_IS_IDS,
} from '../types/trip-constraint.types';

describe('trip-constraint-aggregate.util', () => {
  it('classifyConstraintRefreshType: budget change is deep', () => {
    expect(
      classifyConstraintRefreshType([
        { constraintId: TRIP_CONSTRAINT_LEGACY_IDS.BUDGET_TOTAL, patch: { value: 20000 } },
      ]),
    ).toBe('deep');
  });

  it('classifyConstraintRefreshType: soft priority tweak is quick', () => {
    expect(
      classifyConstraintRefreshType([
        { constraintId: 'c_custom_abc', patch: { priority: 6 } },
      ]),
    ).toBe('quick');
  });

  it('inferConflictConstraintIds: maps budget messages', () => {
    const ids = inferConflictConstraintIds([
      {
        id: 'x',
        source: 'feasibility',
        priority: 'must_handle',
        category: 'other',
        title: '预算不足',
        message: '超出总预算上限',
      },
    ]);
    expect(ids.has(TRIP_CONSTRAINT_LEGACY_IDS.BUDGET_TOTAL)).toBe(true);
  });

  it('inferConflictConstraintIds: maps Iceland F-road conflict to official rule', () => {
    const ids = inferConflictConstraintIds([
      {
        id: 'x',
        source: 'feasibility',
        priority: 'must_handle',
        category: 'transport',
        title: 'F 路车型',
        message: 'VEHICLE_TYPE_INCOMPATIBLE on F208',
      },
    ]);
    expect(ids.has(TRIP_CONSTRAINT_OFFICIAL_IS_IDS.FROAD_2WD)).toBe(true);
  });

  it('isLegacyConstraintId: excludes c_official_*', () => {
    expect(isLegacyConstraintId('c_official_is_froad_2wd')).toBe(false);
    expect(isLegacyConstraintId('c_budget_total')).toBe(true);
  });

  it('aggregateTripConstraints: Iceland trip includes official rules in meta.sections', () => {
    const { items, meta } = aggregateTripConstraints({
      trip: {
        id: 'trip-is',
        destination: 'IS',
        startDate: new Date('2026-07-01'),
        endDate: new Date('2026-07-10'),
        pacingConfig: { travelMode: 'self_drive' },
        budgetConfig: {},
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        TripDay: [
          {
            id: 'd1',
            date: new Date('2026-07-02'),
            ItineraryItem: [
              { type: 'activity', note: 'Blue Lagoon', Place: { nameEN: 'Blue Lagoon' } },
            ],
          },
        ],
      },
      summary: {
        tripId: 'trip-is',
        constraintsVersion: 1,
        pendingCount: 0,
        timeRange: { status: 'confirmed', startDate: '2026-07-01', endDate: '2026-07-10', dayCount: 10 },
        budget: { status: 'draft', total: null, currency: 'CNY', gateStatus: 'ALLOW' },
        travelers: { status: 'draft', count: 2, memberCount: 2, profilingCompletedCount: 0 },
        transport: { status: 'confirmed', travelMode: 'self_drive' },
      },
      userId: 'user-1',
    });
    expect(meta.countryCode).toBe('IS');
    expect(meta.sections?.some((s) => s.key === 'official')).toBe(true);
    expect(items.some((c) => c.id === TRIP_CONSTRAINT_OFFICIAL_IS_IDS.FROAD_2WD)).toBe(true);
    expect(
      items.some((c) => c.id.includes('blue_lagoon_reservation_required')),
    ).toBe(true);
  });

  it('resolveConstraintCardTone: active HARD uses default not danger', () => {
    expect(resolveConstraintCardTone({ status: 'ACTIVE', hasConflict: false })).toBe('default');
    expect(resolveConstraintCardTone({ status: 'LOCKED', hasConflict: false })).toBe('default');
    expect(resolveConstraintCardTone({ status: 'CONFLICTED', hasConflict: true })).toBe('danger');
    expect(resolveConstraintCardTone({ status: 'DRAFT', hasConflict: false })).toBe('caution');
  });
});
