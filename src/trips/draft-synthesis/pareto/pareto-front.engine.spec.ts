import { computeParetoFront, dominates } from './pareto-front.engine';
import type { ObjectiveVector } from './objective-vector.types';

function o(p: Partial<ObjectiveVector>): ObjectiveVector {
  return {
    satisfaction: p.satisfaction ?? 0.5,
    efficiency: p.efficiency ?? 0.5,
    cost: p.cost ?? 0.5,
    fatigue: p.fatigue ?? 0.5,
    experience: p.experience ?? 0.5,
    risk: p.risk ?? 0.5,
  };
}

describe('computeParetoFront', () => {
  it('keeps two non-comparable points', () => {
    const items = [
      { id: 'a', objectives: o({ experience: 0.9, efficiency: 0.3 }) },
      { id: 'b', objectives: o({ experience: 0.4, efficiency: 0.9 }) },
    ];
    const f = computeParetoFront(items);
    expect(f).toHaveLength(2);
  });

  it('drops dominated point', () => {
    const items = [
      { id: 'weak', objectives: o({ satisfaction: 0.3, efficiency: 0.3 }) },
      { id: 'strong', objectives: o({ satisfaction: 0.8, efficiency: 0.8 }) },
    ];
    const f = computeParetoFront(items);
    expect(f.map((x) => x.id)).toEqual(['strong']);
  });

  it('dominates is strict', () => {
    const a = o({ satisfaction: 0.6, efficiency: 0.6 });
    const b = o({ satisfaction: 0.4, efficiency: 0.4 });
    expect(dominates(a, b)).toBe(true);
    expect(dominates(b, a)).toBe(false);
  });
});
