import { buildCausalGraph } from './causal-graph.builder';

describe('buildCausalGraph', () => {
  it('builds constraint → impact → repair → replan → mutation chain', () => {
    const g = buildCausalGraph({
      nowMs: 42,
      constraintDiffs: [
        {
          source: 'ROAD:F208',
          affectedSlots: ['s1'],
          reasonCode: 'IMPASSABLE',
        },
      ],
      repairs: [{ slotId: 's1', action: 'SHIFT_TIME', confidence: 1 }],
      partialReplan: {
        updatedSlots: [],
        affectedDays: [],
        diff: { changedSlotIds: ['s1'], touchedDayDates: ['2026-06-01'] },
      },
      semanticDelta: { kind: 'PARTIAL_REPLAN_EXECUTED' },
    });

    expect(g.nodes.some((n) => n.type === 'CONSTRAINT')).toBe(true);
    expect(g.nodes.some((n) => n.type === 'IMPACT' && n.target === 's1')).toBe(
      true,
    );
    expect(g.nodes.some((n) => n.type === 'REPAIR')).toBe(true);
    expect(g.nodes.some((n) => n.type === 'REPLAN')).toBe(true);
    expect(g.nodes.some((n) => n.type === 'MUTATION')).toBe(true);
    expect(g.nodes.every((n) => n.timestamp === 42)).toBe(true);
  });
});
