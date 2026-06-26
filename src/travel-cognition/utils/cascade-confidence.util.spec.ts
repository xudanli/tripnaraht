import {
  CASCADE_CONFIDENCE_DECAY_PER_HOP,
  decayCascadeConfidence,
  propagateWithConfidence,
  withCascadeHop,
} from './cascade-confidence.util';

describe('cascade-confidence', () => {
  it('decays confidence per hop', () => {
    expect(decayCascadeConfidence(1, 0)).toBe(1);
    expect(decayCascadeConfidence(1, 1)).toBeCloseTo(CASCADE_CONFIDENCE_DECAY_PER_HOP);
    expect(decayCascadeConfidence(0.9, 2)).toBeCloseTo(0.9 * CASCADE_CONFIDENCE_DECAY_PER_HOP ** 2);
  });

  it('clamps below minimum cascade confidence', () => {
    expect(decayCascadeConfidence(0.3, 10)).toBe(0.2);
  });

  it('annotates impact nodes with hop metadata', () => {
    const node = withCascadeHop({ message: 'test' }, 0.9, 2);
    expect(node.propagationHop).toBe(2);
    expect(node.cascadeConfidence).toBeCloseTo(0.9 * CASCADE_CONFIDENCE_DECAY_PER_HOP ** 2);
  });

  it('propagates with bounded depth and per-node confidence', () => {
    const edges = [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'c', to: 'd' },
    ];
    const states = propagateWithConfidence(new Set(['a']), edges, 0.9, 2);
    expect(states.get('a')?.depth).toBe(0);
    expect(states.get('b')?.depth).toBe(1);
    expect(states.get('c')?.depth).toBe(2);
    expect(states.has('d')).toBe(false);
    expect(states.get('c')?.confidence).toBeCloseTo(0.9 * CASCADE_CONFIDENCE_DECAY_PER_HOP ** 2);
  });
});
