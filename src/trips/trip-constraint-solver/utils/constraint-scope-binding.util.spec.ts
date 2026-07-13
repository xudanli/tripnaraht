import {
  applyConstraintScopePatch,
  constraintAppliesInContext,
  constraintAppliesToConflict,
  formatConstraintScopeSummary,
  inferCoarseScopeFromBinding,
  mergeConstraintValueOnPatch,
  readScopeBindingFromValue,
  validateScopeBinding,
  writeConstraintExtendedValue,
} from './constraint-scope-binding.util';
import { TRIP_CONSTRAINT_LEGACY_IDS } from '../types/trip-constraint.types';
import type { ConstraintScopeBinding } from '../types/trip-constraint.types';

const routeSegmentBinding: ConstraintScopeBinding = {
  temporal: {
    kind: 'route_segment',
    segmentId: 'item-a__item-b',
    label: 'D2 维克 → 冰河湖',
    dayNumber: 2,
    fromItemId: 'item-a',
    toItemId: 'item-b',
  },
  member: { kind: 'members', memberIds: ['u1'], labels: ['Alice'] },
  phase: { planning: true, execution: true },
  activity: { kind: 'all' },
};

describe('constraint-scope-binding.util', () => {
  it('formatConstraintScopeSummary matches frontend semantics', () => {
    expect(formatConstraintScopeSummary(routeSegmentBinding)).toBe(
      'D2 维克 → 冰河湖 · Alice',
    );
  });

  it('mergeConstraintValueOnPatch preserves scopeBinding on partial patch', () => {
    const merged = mergeConstraintValueOnPatch(
      { hours: 4, scopeBinding: routeSegmentBinding },
      { hours: 5 },
    );
    expect(merged.hours).toBe(5);
    expect(readScopeBindingFromValue(merged)?.temporal.dayNumber).toBe(2);
  });

  it('inferCoarseScopeFromBinding maps route_segment to ROUTE_SEGMENT with segment fields', () => {
    expect(inferCoarseScopeFromBinding(routeSegmentBinding)).toEqual({
      type: 'ROUTE_SEGMENT',
      ids: ['item-a__item-b'],
      segmentId: 'item-a__item-b',
      fromItemId: 'item-a',
      toItemId: 'item-b',
      dayIndex: 2,
    });
  });

  it('applyConstraintScopePatch round-trips route segment scopeBinding', () => {
    const result = applyConstraintScopePatch({
      prevScope: { type: 'TRIP' },
      prevValue: { unpavedAllowed: false, templateId: 'no_unpaved_road' },
      dtoScope: { type: 'ROUTE_SEGMENT', segmentId: 'item-a__item-b', dayIndex: 2 },
      dtoValue: {
        scopeBinding: {
          temporal: {
            kind: 'route_segment',
            segmentId: 'item-a__item-b',
            label: 'D2 维克 → 冰河湖',
            dayNumber: 2,
            fromItemId: 'item-a',
            toItemId: 'item-b',
          },
        },
      },
    });
    expect(result.errors).toBeUndefined();
    expect(readScopeBindingFromValue(result.value)?.temporal.label).toBe('D2 维克 → 冰河湖');
    expect(result.scope).toMatchObject({
      type: 'ROUTE_SEGMENT',
      segmentId: 'item-a__item-b',
      dayIndex: 2,
    });
  });

  it('applyConstraintScopePatch coerces partial scopeBinding with defaults', () => {
    const result = applyConstraintScopePatch({
      prevScope: { type: 'TRIP' },
      prevValue: { minWeatherScore: 60 },
      dtoScope: { type: 'DAY', dayIndex: 3 },
      dtoValue: {
        scopeBinding: {
          temporal: { kind: 'day', dayNumber: 3 },
        },
      },
    });
    expect(result.errors).toBeUndefined();
    expect(readScopeBindingFromValue(result.value)?.phase).toEqual({
      planning: true,
      execution: true,
    });
    expect(result.scope.type).toBe('DAY');
    expect(result.scope.dayIndex).toBe(3);
  });

  it('applyConstraintScopePatch maps MEMBER scope without reverting to MEMBER_GROUP', () => {
    const result = applyConstraintScopePatch({
      prevScope: { type: 'MEMBER_GROUP' },
      prevValue: { maxWalkKm: 3 },
      dtoScope: { type: 'MEMBER', ids: ['u1'] },
      dtoValue: {
        scopeBinding: {
          temporal: { kind: 'trip' },
          member: { kind: 'members', memberIds: ['u1'], labels: ['Alice'] },
          phase: { planning: true, execution: false },
          activity: { kind: 'all' },
        },
      },
    });
    expect(result.scope).toEqual({ type: 'MEMBER', ids: ['u1'] });
    expect(readScopeBindingFromValue(result.value)?.member.memberIds).toEqual(['u1']);
  });

  it('applyConstraintScopePatch supports day_range via scope.dayFrom/dayTo', () => {
    const result = applyConstraintScopePatch({
      prevScope: { type: 'TRIP' },
      prevValue: {},
      dtoScope: { type: 'DAY', dayFrom: 2, dayTo: 4 },
      dtoValue: {
        scopeBinding: {
          temporal: { kind: 'day_range', dayFrom: 2, dayTo: 4 },
          member: { kind: 'all' },
          phase: { planning: true, execution: true },
          activity: { kind: 'all' },
        },
      },
    });
    expect(result.scope.dayFrom).toBe(2);
    expect(result.scope.dayTo).toBe(4);
    expect(readScopeBindingFromValue(result.value)?.temporal.kind).toBe('day_range');
  });

  it('constraintAppliesInContext filters by day', () => {
    const day3Only: ConstraintScopeBinding = {
      ...routeSegmentBinding,
      temporal: { kind: 'day', dayNumber: 3 },
    };
    expect(
      constraintAppliesInContext(day3Only, { dayNumber: 2, phase: 'planning' }),
    ).toBe(false);
    expect(
      constraintAppliesInContext(day3Only, { dayNumber: 3, phase: 'planning' }),
    ).toBe(true);
  });

  it('constraintAppliesToConflict skips out-of-scope daily_drive', () => {
    const applies = constraintAppliesToConflict(
      {
        status: 'ACTIVE',
        value: {
          hours: 4,
          scopeBinding: {
            ...routeSegmentBinding,
            temporal: { kind: 'day', dayNumber: 3 },
          },
        },
      },
      {
        id: 'x',
        source: 'feasibility',
        priority: 'must_handle',
        category: 'transport',
        title: '每日驾驶上限',
        message: 'daily_drive exceeded',
        affectedDays: [2],
      },
    );
    expect(applies).toBe(false);
  });

  it('writeConstraintExtendedValue round-trips PATCH body', () => {
    const metadata = writeConstraintExtendedValue({}, TRIP_CONSTRAINT_LEGACY_IDS.MAX_DAILY_DRIVE, {
      hours: 4,
      scopeBinding: routeSegmentBinding,
    });
    expect(
      readScopeBindingFromValue(
        (metadata.constraintExtendedValues as Record<string, unknown>)[
          TRIP_CONSTRAINT_LEGACY_IDS.MAX_DAILY_DRIVE
        ],
      )?.temporal.segmentId,
    ).toBe('item-a__item-b');
  });

  it('validateScopeBinding rejects empty memberIds', () => {
    const errors = validateScopeBinding({
      ...routeSegmentBinding,
      member: { kind: 'members', memberIds: [] },
    });
    expect(errors.some((e) => e.field === 'member.memberIds')).toBe(true);
  });
});
