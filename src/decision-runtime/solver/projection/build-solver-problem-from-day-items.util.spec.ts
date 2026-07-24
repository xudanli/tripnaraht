import {
  buildSolverProblemFromDayItems,
  dateToDayMinutes,
  serviceDurationMinutes,
} from './build-solver-problem-from-day-items.util';

describe('buildSolverProblemFromDayItems', () => {
  const items = [
    {
      itemId: 'act-1',
      label: 'A',
      startTime: new Date('2026-07-20T09:00:00.000Z'),
      endTime: new Date('2026-07-20T10:30:00.000Z'),
      travelFromPreviousDurationMin: 20,
    },
    {
      itemId: 'act-2',
      label: 'B',
      startTime: new Date('2026-07-20T11:00:00.000Z'),
      endTime: new Date('2026-07-20T12:00:00.000Z'),
      travelFromPreviousDurationMin: 25,
    },
    {
      itemId: 'act-3',
      label: 'C',
      startTime: new Date('2026-07-20T13:00:00.000Z'),
      endTime: new Date('2026-07-20T14:30:00.000Z'),
      travelFromPreviousDurationMin: 30,
    },
  ];

  it('returns null when < 2 items', () => {
    expect(
      buildSolverProblemFromDayItems({
        requestId: 'r1',
        tripId: 't1',
        planVersionId: '1',
        dayIndex: 1,
        items: items.slice(0, 1),
      }),
    ).toBeNull();
  });

  it('projects SWAP VRPTW with depot and travel hops', () => {
    const problem = buildSolverProblemFromDayItems({
      requestId: 'r1',
      tripId: 't1',
      planVersionId: '1',
      dayIndex: 1,
      items,
    });
    expect(problem).not.toBeNull();
    expect(problem!.operation).toBe('SWAP');
    expect(problem!.nodes.map((n) => n.nodeId)).toEqual([
      'depot',
      'act-1',
      'act-2',
      'act-3',
    ]);
    expect(serviceDurationMinutes(items[0]!)).toBe(90);
    expect(dateToDayMinutes(items[0]!.startTime)).toBe(9 * 60);
    const depotIdx = 0;
    const act1Idx = 1;
    expect(problem!.travelMatrix.costsMin[depotIdx][act1Idx]).toBe(20);
    expect(problem!.constraints.some((c) => c.kind === 'EDGE_FORBIDDEN')).toBe(
      false,
    );
  });
});
