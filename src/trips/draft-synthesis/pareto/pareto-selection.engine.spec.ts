import { buildTravelPersona } from '../persona-policy/persona-presets';
import { selectFromParetoFront } from './pareto-selection.engine';
import type { ObjectiveVector } from './objective-vector.types';

function ov(p: Partial<ObjectiveVector>): ObjectiveVector {
  return {
    satisfaction: p.satisfaction ?? 0.5,
    efficiency: p.efficiency ?? 0.5,
    cost: p.cost ?? 0.5,
    fatigue: p.fatigue ?? 0.5,
    experience: p.experience ?? 0.5,
    risk: p.risk ?? 0.5,
  };
}

describe('selectFromParetoFront', () => {
  it('RELAXER prefers high fatigue score', () => {
    const p = buildTravelPersona('u', 'RELAXER');
    const front = [
      { id: 'A' as const, objectives: ov({ fatigue: 0.9, efficiency: 0.4 }) },
      { id: 'B' as const, objectives: ov({ fatigue: 0.4, efficiency: 0.95 }) },
    ];
    const sel = selectFromParetoFront(front, p);
    expect(sel.id).toBe('A');
  });

  it('EFFICIENCY_HUNTER prefers efficiency', () => {
    const p = buildTravelPersona('u', 'EFFICIENCY_HUNTER');
    const front = [
      { id: 'A' as const, objectives: ov({ fatigue: 0.95, efficiency: 0.35 }) },
      { id: 'B' as const, objectives: ov({ fatigue: 0.4, efficiency: 0.92 }) },
    ];
    const sel = selectFromParetoFront(front, p);
    expect(sel.id).toBe('B');
  });
});
