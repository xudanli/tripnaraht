import { buildAssertionFromGateViolation, gateProblemDuplicatesFeasibility } from './from-gate-violation.adapter';
import type { FeasibilityIssueDto } from '../../trip-constraint-solver/types/trip-constraint-solver.types';
import {
  buildMutationsFromRepairOption,
  buildMutationsFromItineraryDiff,
  buildTripMutationSet,
} from '../mutation/trip-mutation.builder';

describe('from-gate-violation.adapter', () => {
  it('maps HARD SAFETY gate violation to BLOCK and non-overridable', () => {
    const a = buildAssertionFromGateViolation(
      {
        type: 'SAFETY',
        severity: 'HARD',
        detail: 'F-road 须四驱，当前为 2WD',
        constraint: 'froad_2wd',
      },
      0,
    );
    expect(a.sourceSystem).toBe('GATE');
    expect(a.enforcement).toBe('BLOCK');
    expect(a.overridable).toBe(false);
    expect(a.domain).toBe('SAFETY');
  });

  it('detects duplicate feasibility coverage', () => {
    const issues: FeasibilityIssueDto[] = [
      {
        id: 'i1',
        priority: 'must_handle',
        category: 'transport',
        title: 'x',
        message: 'F-road 须四驱，当前为 2WD',
        affectedDays: [2],
        severity: 'high',
        issueKind: 'froad_2wd',
      },
    ];
    expect(
      gateProblemDuplicatesFeasibility('F-road 须四驱，当前为 2WD', 'froad_2wd', issues),
    ).toBe(true);
  });
});

describe('trip-mutation.builder', () => {
  it('builds INSERT DAY mutation from insert_rest_day action', () => {
    const mutations = buildMutationsFromRepairOption(
      {
        id: 'insert_rest',
        title: '插入缓冲日',
        impact: 'high',
        actionType: 'insert_rest_day',
        payload: { afterDayNumber: 3, strategy: 'insert_rest' },
      },
      {
        id: 'issue-1',
        priority: 'must_handle',
        category: 'schedule',
        title: 't',
        message: 'm',
        affectedDays: [3],
        severity: 'high',
      },
      [{ dimension: 'TIME', direction: 'WORSEN', value: 1, unit: 'DAY', explanation: '+1 day' }],
    );
    expect(mutations.some((m) => m.operation === 'ADD' && m.entityType === 'DAY')).toBe(true);
  });

  it('maps itineraryDiff to mutations', () => {
    const mutations = buildMutationsFromItineraryDiff(
      [
        {
          slotId: 'slot-1',
          changeType: 'time_changed',
          dayNumber: 2,
          before: { time: '09:00' },
          after: { time: '10:30' },
        },
      ],
      [{ dimension: 'TIME', direction: 'WORSEN', explanation: 'delay' }],
    );
    expect(mutations[0].operation).toBe('UPDATE');
    expect(mutations[0].entityId).toBe('slot-1');
  });

  it('builds TripMutationSet with versionBefore', () => {
    const set = buildTripMutationSet({
      tripId: 'trip1',
      versionBefore: '42',
      createdBy: 'user1',
      option: { id: 'o1', title: 't', impact: 'medium', actionType: 'shift_departure', payload: { shiftMinutes: 30 } },
      issue: {
        id: 'i1',
        priority: 'suggest_adjust',
        category: 'schedule',
        title: 't',
        message: 'm',
        affectedDays: [1],
        severity: 'medium',
        fromItemId: 'item-a',
      },
      tradeoffs: [],
    });
    expect(set.versionBefore).toBe('42');
    expect(set.operations.length).toBeGreaterThan(0);
  });
});
