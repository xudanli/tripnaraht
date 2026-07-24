import {
  pickBestSolverCandidate,
  solverCandidateToPlanProposalChanges,
} from './ortools-to-plan-proposal-changes.adapter';
import type { DayVrptwItemInput } from '../projection/build-solver-problem-from-day-items.util';

describe('ortools-to-plan-proposal-changes', () => {
  const items: DayVrptwItemInput[] = [
    {
      itemId: 'a1',
      label: 'One',
      startTime: new Date('2026-07-20T09:00:00.000Z'),
      endTime: new Date('2026-07-20T10:00:00.000Z'),
    },
    {
      itemId: 'a2',
      label: 'Two',
      startTime: new Date('2026-07-20T11:00:00.000Z'),
      endTime: new Date('2026-07-20T12:00:00.000Z'),
    },
  ];

  it('emits MOVE changes when order differs', () => {
    const changes = solverCandidateToPlanProposalChanges({
      dayIndex: 1,
      items,
      candidate: {
        candidateId: 'c1',
        operation: 'SWAP',
        label: 'swap-0',
        dayPlans: [
          {
            dayId: 'day-1',
            nodeIds: ['depot', 'a2', 'a1'],
            startMin: [480, 540, 660],
          },
        ],
        objectiveValue: 40,
      },
    });
    expect(changes.length).toBe(2);
    expect(changes.every((c) => c.operation === 'MOVE')).toBe(true);
    expect(changes[0]!.itemId).toBe('a2');
    expect(changes[0]!.note).toContain('ortools-shadow');
  });

  it('picks lowest objective', () => {
    const best = pickBestSolverCandidate([
      {
        candidateId: 'b',
        operation: 'SWAP',
        label: 'b',
        dayPlans: [],
        objectiveValue: 100,
      },
      {
        candidateId: 'a',
        operation: 'SWAP',
        label: 'a',
        dayPlans: [],
        objectiveValue: 10,
      },
    ]);
    expect(best?.candidateId).toBe('a');
  });
});
