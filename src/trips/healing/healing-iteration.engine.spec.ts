import { buildUnifiedExecutionSemanticView } from '../decision/execution/unified-execution-semantic-view';
import { runHealingIteration } from './healing-iteration.engine';

describe('runHealingIteration', () => {
  it('merges partial replan slots and rebuilds semantic view', () => {
    const plan = {
      version: '1',
      createdAt: 't',
      days: [
        {
          day: 1,
          date: '2026-06-01',
          timeSlots: [
            {
              id: 's1',
              time: '09:00',
              title: 'Drive',
              type: 'nature' as const,
            },
          ],
        },
      ],
    };

    const out = runHealingIteration({
      plan,
      diff: {
        changedSlots: ['s1'],
        severity: 'LOW',
        requiresReplan: true,
        isMeaningfulChange: true,
      },
      buildSemanticView: (p) =>
        buildUnifiedExecutionSemanticView({
          planDates: p.days.map((d) => d.date),
        }),
    });

    expect(out.updatedPlan.days[0]!.timeSlots[0]!.time).not.toBe('09:00');
    expect(out.semanticView.version).toBe('1');
    expect(out.partialResult.updatedSlots.length).toBeGreaterThan(0);
  });
});
