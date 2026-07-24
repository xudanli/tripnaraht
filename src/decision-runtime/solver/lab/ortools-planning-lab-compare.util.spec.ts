import {
  buildOrToolsPlanningLabCompare,
  formatOrtToolsPlanningLabTradeoff,
  pairwiseDisorder,
  pathTravelMinutes,
} from './ortools-planning-lab-compare.util';
import { buildSolverProblemFromDayItems } from '../projection/build-solver-problem-from-day-items.util';

describe('ortools-planning-lab-compare', () => {
  const items = [
    {
      itemId: 'a1',
      startTime: new Date('2026-07-20T09:00:00.000Z'),
      endTime: new Date('2026-07-20T10:00:00.000Z'),
      travelFromPreviousDurationMin: 10,
    },
    {
      itemId: 'a2',
      startTime: new Date('2026-07-20T11:00:00.000Z'),
      endTime: new Date('2026-07-20T12:00:00.000Z'),
      travelFromPreviousDurationMin: 40,
    },
    {
      itemId: 'a3',
      startTime: new Date('2026-07-20T13:00:00.000Z'),
      endTime: new Date('2026-07-20T14:00:00.000Z'),
      travelFromPreviousDurationMin: 15,
    },
  ];

  it('pairwiseDisorder is 1 for full reverse', () => {
    expect(pairwiseDisorder(['a', 'b', 'c'], ['c', 'b', 'a'])).toBe(1);
    expect(pairwiseDisorder(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(0);
  });

  it('builds observational compare with travel delta', () => {
    const problem = buildSolverProblemFromDayItems({
      requestId: 'r1',
      tripId: 't1',
      planVersionId: '1',
      dayIndex: 1,
      items,
    })!;
    const report = buildOrToolsPlanningLabCompare({
      tripId: 't1',
      dayIndex: 1,
      items,
      legacyChanges: [
        {
          operation: 'MOVE',
          itemId: 'a3',
          dayIndex: 1,
          startTime: '09:00',
          endTime: '10:00',
        },
        {
          operation: 'MOVE',
          itemId: 'a2',
          dayIndex: 1,
          startTime: '10:15',
          endTime: '11:15',
        },
        {
          operation: 'MOVE',
          itemId: 'a1',
          dayIndex: 1,
          startTime: '11:30',
          endTime: '12:30',
        },
      ],
      shadowChanges: [],
      shadowNodeOrder: ['depot', 'a1', 'a3', 'a2'],
      problem,
    });

    expect(report.schemaId).toBe('tripnara.ortools_planning_lab_compare@v1');
    expect(report.authoritativePromotion).toBe(false);
    expect(report.shadowAuthority).toBe(false);
    expect(report.legacyOrder).toEqual(['a3', 'a2', 'a1']);
    expect(report.shadowOrder).toEqual(['a1', 'a3', 'a2']);
    expect(report.legacyBaseDisorder).toBe(1);
    expect(report.baseTravelMin).toBe(
      pathTravelMinutes(problem, ['a1', 'a2', 'a3']),
    );
    expect(typeof report.travelDeltaLegacyMinusShadow).toBe('number');
    const note = formatOrtToolsPlanningLabTradeoff(report);
    expect(note).toContain('[ortools-lab]');
    expect(note).toContain('observational only');
  });
});
