import {
  expandConflictLookupIds,
  isDecisionSpaceFocusId,
  resolveDecisionBasisFocus,
} from './resolve-conflict-lookup-ids.util';
import { pickPrimaryConflict } from './planning-decision-basis.projection.util';
import { ConflictType } from '../../dto/trip-conflicts.dto';
import type { ConflictDto } from '../../dto/trip-conflicts.dto';

describe('resolve-conflict-lookup-ids', () => {
  it('expands dp_id issue-time-conflict to raw conflict id', () => {
    const ids = expandConflictLookupIds(
      'dp_id:issue-time-conflict-aaa-bbb',
    );
    expect(ids).toContain('time-conflict-aaa-bbb');
    expect(ids).toContain('issue-time-conflict-aaa-bbb');
  });

  it('expands dp_travel same_day_travel to same-day-travel id', () => {
    const ids = expandConflictLookupIds(
      'dp_travel:same_day_travel:from1:to2',
    );
    expect(ids).toContain('same-day-travel-from1-to2');
  });

  it('treats dc_* conflictId as decision-space focus', () => {
    expect(isDecisionSpaceFocusId('dc_glacier_trip1')).toBe(true);
    const focus = resolveDecisionBasisFocus({
      conflictId: 'dc_glacier_trip1',
    });
    expect(focus.allowMissingConflict).toBe(true);
    expect(focus.problemId).toBe('dc_glacier_trip1');
  });
});

describe('pickPrimaryConflict with lookupIds', () => {
  const conflicts: ConflictDto[] = [
    {
      id: 'time-conflict-a-b',
      type: ConflictType.TIME_CONFLICT,
      severity: 'HIGH' as never,
      title: '时间冲突',
      description: 'x',
      affectedDays: ['2'],
    },
  ];

  it('finds conflict via expanded decision-problem id', () => {
    const hit = pickPrimaryConflict(
      conflicts,
      undefined,
      expandConflictLookupIds('dp_id:issue-time-conflict-a-b'),
    );
    expect(hit?.id).toBe('time-conflict-a-b');
  });
});
