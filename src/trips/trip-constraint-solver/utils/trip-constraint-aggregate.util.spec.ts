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
    const { items, meta, contract } = aggregateTripConstraints({
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
    expect(meta.sections?.some((s) => s.key === 'readonly_official')).toBe(true);
    expect(meta.sections?.some((s) => s.key === 'travel_objectives')).toBe(true);
    expect(meta.sections?.some((s) => s.key === 'hard_must_satisfy')).toBe(true);
    expect(items.some((c) => c.id === TRIP_CONSTRAINT_OFFICIAL_IS_IDS.FROAD_2WD)).toBe(true);
    expect(
      items.some((c) => c.id.includes('blue_lagoon_reservation_required')),
    ).toBe(true);
    expect(contract.schemaId).toBe('tripnara.travel_decision_contract@v1');
    expect(contract.objectives.rankedPrinciples.length).toBeGreaterThan(0);
    expect(contract.displayPrinciples[0]?.label).toBeTruthy();
    expect(contract.compiledWeights.legacy.safety).toBeGreaterThan(0);
  });

  it('aggregateTripConstraints: self-drive includes no_night_drive with contractMeta', () => {
    const { items, meta } = aggregateTripConstraints({
      trip: {
        id: 'trip-self-drive',
        destination: 'IS',
        startDate: new Date('2026-07-01'),
        endDate: new Date('2026-07-10'),
        pacingConfig: { travelMode: 'self_drive' },
        budgetConfig: { total: 50000, currency: 'CNY' },
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      summary: {
        tripId: 'trip-self-drive',
        constraintsVersion: 1,
        pendingCount: 0,
        timeRange: { status: 'confirmed', startDate: '2026-07-01', endDate: '2026-07-10', dayCount: 10 },
        budget: { status: 'confirmed', total: 50000, currency: 'CNY', gateStatus: 'ALLOW' },
        travelers: { status: 'draft', count: 2, memberCount: 2, profilingCompletedCount: 0 },
        transport: { status: 'confirmed', travelMode: 'self_drive' },
      },
      userId: 'user-1',
    });

    const hardSection = meta.sections?.find((s) => s.key === 'hard_must_satisfy');
    const officialSection = meta.sections?.find((s) => s.key === 'readonly_official');
    expect(hardSection?.constraintIds).toContain(TRIP_CONSTRAINT_LEGACY_IDS.MAX_DAILY_DRIVE);
    expect(hardSection?.constraintIds).toContain(TRIP_CONSTRAINT_LEGACY_IDS.NO_NIGHT_DRIVE);
    expect(officialSection?.constraintIds ?? []).not.toContain(TRIP_CONSTRAINT_LEGACY_IDS.MAX_DAILY_DRIVE);

    const noNight = items.find((c) => c.id === TRIP_CONSTRAINT_LEGACY_IDS.NO_NIGHT_DRIVE);
    expect(noNight).toBeDefined();
    expect(noNight?.type).toBe('HARD');
    expect(noNight?.contractMeta?.judgmentRule).toContain('日落后');
    expect(noNight?.source.templateId).toBe('no_night_drive');

    const maxDaily = items.find((c) => c.id === TRIP_CONSTRAINT_LEGACY_IDS.MAX_DAILY_DRIVE);
    expect(maxDaily).toBeDefined();
    expect(maxDaily?.type).toBe('HARD');
    expect(maxDaily?.source.type).toBe('USER');
    expect(maxDaily?.source.templateId).toBe('max_daily_drive');
    expect(maxDaily?.contractMeta?.judgmentRule).toContain('小时');

    const budget = items.find((c) => c.id === TRIP_CONSTRAINT_LEGACY_IDS.BUDGET_TOTAL);
    expect(budget?.contractMeta?.judgmentRule).toContain('50000');
    expect(budget?.contractMeta?.violationResultLabel).toBeTruthy();
  });

  it('resolveConstraintCardTone: active HARD uses default not danger', () => {
    expect(resolveConstraintCardTone({ status: 'ACTIVE', hasConflict: false })).toBe('default');
    expect(resolveConstraintCardTone({ status: 'LOCKED', hasConflict: false })).toBe('default');
    expect(resolveConstraintCardTone({ status: 'CONFLICTED', hasConflict: true })).toBe('danger');
    expect(resolveConstraintCardTone({ status: 'DRAFT', hasConflict: false })).toBe('caution');
  });
});
