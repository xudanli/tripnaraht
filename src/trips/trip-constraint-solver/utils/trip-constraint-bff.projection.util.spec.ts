import {
  projectTripConstraintForBff,
  projectTripConstraintsForBff,
  buildScopeLabel,
} from './trip-constraint-bff.projection.util';
import {
  TRIP_CONSTRAINT_LEGACY_IDS,
  type TripConstraint,
} from '../types/trip-constraint.types';

const baseConstraint = (overrides: Partial<TripConstraint>): TripConstraint => ({
  id: 'c_test',
  tripId: 'trip-1',
  name: '测试约束',
  category: 'SAFETY',
  type: 'HARD',
  status: 'ACTIVE',
  scope: { type: 'TRIP' },
  operator: 'LTE',
  value: 1,
  allowRelaxation: false,
  locked: false,
  source: { type: 'USER' },
  visibility: 'TEAM',
  createdBy: 'user-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  enabled: true,
  ...overrides,
});

describe('trip-constraint-bff.projection.util', () => {
  it('buildScopeLabel: TRIP → 整趟行程', () => {
    expect(buildScopeLabel({ type: 'TRIP' })).toBe('整趟行程');
  });

  it('projects no_night_drive with judgmentRule and contractMeta', () => {
    const projected = projectTripConstraintForBff(
      baseConstraint({
        id: TRIP_CONSTRAINT_LEGACY_IDS.NO_NIGHT_DRIVE,
        name: '不夜驾',
        value: { maxMinutesAfterSunset: 30 },
        source: { type: 'USER', templateId: 'no_night_drive' },
      }),
    );

    expect(projected.source.templateId).toBe('no_night_drive');
    expect(projected.enabled).toBe(true);
    expect(projected.contractMeta?.enabledSummary).toBe('已启用：不夜驾');
    expect(projected.contractMeta?.scopeLabel).toBe('整趟行程');
    expect(projected.contractMeta?.judgmentRule).toBe('日落后 30 分钟不得继续驾驶');
    expect(projected.contractMeta?.violationResult).toBe('BLOCK');
    expect(projected.contractMeta?.violationResultLabel).toBe('阻断执行');
    expect((projected.value as Record<string, unknown>).judgmentRule).toBe(
      '日落后 30 分钟不得继续驾驶',
    );
    expect((projected.value as Record<string, unknown>).violationResult).toBe('阻断执行');
  });

  it('projects max_daily_drive structured value', () => {
    const projected = projectTripConstraintForBff(
      baseConstraint({
        id: TRIP_CONSTRAINT_LEGACY_IDS.MAX_DAILY_DRIVE,
        name: '每日驾驶上限',
        value: 4,
        unit: 'hour',
        category: 'TRANSPORT',
      }),
    );

    expect(projected.source.templateId).toBe('max_daily_drive');
    expect(projected.contractMeta?.judgmentRule).toBe('单日驾驶时长不超过 4 小时');
    expect(projected.capability?.constraintKey).toBe('MAX_DAILY_DRIVE');
    expect(projected.capability?.enforcementLevel).toBe('ENABLED');
    expect((projected.value as Record<string, unknown>).maxHours).toBe(4);
    expect(projected.displayValue).toBe('4 小时/天');
  });

  it('projects budget_total with currency', () => {
    const projected = projectTripConstraintForBff(
      baseConstraint({
        id: TRIP_CONSTRAINT_LEGACY_IDS.BUDGET_TOTAL,
        name: '总预算上限',
        category: 'BUDGET',
        value: 50000,
        unit: 'CNY',
      }),
    );

    expect(projected.contractMeta?.judgmentRule).toBe('总预算不超过 50000 CNY');
    expect((projected.value as Record<string, unknown>).total).toBe(50000);
    expect((projected.value as Record<string, unknown>).currency).toBe('CNY');
  });

  it('DISABLED status → enabled false and muted summary', () => {
    const projected = projectTripConstraintForBff(
      baseConstraint({
        id: TRIP_CONSTRAINT_LEGACY_IDS.NO_NIGHT_DRIVE,
        name: '不夜驾',
        status: 'DISABLED',
        value: { maxMinutesAfterSunset: 30 },
        source: { type: 'USER', templateId: 'no_night_drive' },
      }),
    );

    expect(projected.enabled).toBe(false);
    expect(projected.contractMeta?.enabledSummary).toBe('已停用：不夜驾');
  });

  it('DISPLAY_ONLY catalog HARD uses advisory violation label', () => {
    const projected = projectTripConstraintForBff(
      baseConstraint({
        id: 'c_tpl_elderly_walk_limit',
        name: '老人步行上限',
        source: { type: 'USER', templateId: 'elderly_walk_limit' },
        value: { maxMinutes: 30 },
      }),
    );

    expect(projected.capability?.enforcementLevel).toBe('DISPLAY_ONLY');
    expect(projected.capability?.phase0UiPolicy).toBe('HIDDEN');
    expect(projected.contractMeta?.violationResultLabel).toBe('偏好记录');
    expect((projected.value as Record<string, unknown>).violationResult).toBe('偏好记录');
  });

  it('projectTripConstraintsForBff maps all items', () => {
    const items = projectTripConstraintsForBff([
      baseConstraint({ id: TRIP_CONSTRAINT_LEGACY_IDS.MAX_DAILY_DRIVE, value: 3 }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].contractMeta?.judgmentRule).toContain('3 小时');
  });
});
