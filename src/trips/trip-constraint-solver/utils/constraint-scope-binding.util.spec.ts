import {
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

  it('inferCoarseScopeFromBinding maps route_segment to ROUTE_SEGMENT', () => {
    expect(inferCoarseScopeFromBinding(routeSegmentBinding)).toEqual({
      type: 'ROUTE_SEGMENT',
      ids: ['item-a__item-b'],
    });
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
