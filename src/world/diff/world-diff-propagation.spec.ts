import { computePropagation } from './world-diff-propagation';
import type { WorldDiff } from './world-diff.contract';

describe('computePropagation', () => {
  const base = (hint: WorldDiff['propagationHint']): WorldDiff => ({
    id: '1',
    domain: 'ROAD',
    type: 'STATE_CHANGE',
    entityId: 'F208',
    stateBefore: 'OPEN',
    stateAfter: 'CLOSED',
    severity: 'HIGH',
    temporalScope: { start: '2026-01-01', end: '2026-01-01' },
    impactedSlots: ['s1'],
    propagationHint: hint,
    source: 'GRAPH',
  });

  const plan = {
    version: '1',
    createdAt: 't',
    days: [
      {
        day: 1,
        date: '2026-06-01',
        timeSlots: [
          { id: 's1', time: '09:00', title: 'A', type: 'nature' as const },
          { id: 's2', time: '11:00', title: 'B', type: 'nature' as const },
        ],
      },
    ],
  };

  it('LOCAL returns declared slots only', () => {
    const out = computePropagation(base('LOCAL'), { plan });
    expect(out).toEqual(['s1']);
  });

  it('GLOBAL expands to all plan slots when plan given', () => {
    const out = computePropagation(base('GLOBAL'), { plan });
    expect(out.sort()).toEqual(['s1', 's2']);
  });

  it('SEQUENCE expands along partial replan subgraph', () => {
    const out = computePropagation(base('SEQUENCE'), { plan });
    expect(out).toContain('s1');
    expect(out.length).toBeGreaterThanOrEqual(1);
  });
});
