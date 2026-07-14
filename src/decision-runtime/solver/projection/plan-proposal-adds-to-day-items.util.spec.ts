import {
  pickDensestArrangeDay,
  planProposalAddsToDayItems,
} from './plan-proposal-adds-to-day-items.util';

describe('plan-proposal-adds-to-day-items', () => {
  const changes = [
    {
      operation: 'ADD' as const,
      candidateId: 'c1',
      dayIndex: 1,
      startTime: '09:00',
      endTime: '10:30',
      label: 'A',
    },
    {
      operation: 'ADD' as const,
      candidateId: 'c2',
      dayIndex: 1,
      startTime: '11:00',
      endTime: '12:00',
      label: 'B',
    },
    {
      operation: 'ADD' as const,
      candidateId: 'c3',
      dayIndex: 2,
      startTime: '09:00',
      endTime: '10:00',
      label: 'C',
    },
    {
      operation: 'REMOVE_CANDIDATE' as const,
      candidateId: 'c1',
      dayIndex: 1,
    },
  ];

  it('picks densest day with ≥2 ADDs', () => {
    expect(pickDensestArrangeDay(changes)).toBe(1);
  });

  it('maps ADD times to DayVrptwItemInput', () => {
    const items = planProposalAddsToDayItems({ changes, dayIndex: 1 });
    expect(items).toHaveLength(2);
    expect(items[0]!.itemId).toBe('c1');
    expect(items[0]!.startTime.toISOString()).toContain('T09:00:00');
    expect(items[1]!.itemId).toBe('c2');
  });
});
