import { ConstraintScorer } from './constraint-scorer.util';

describe('ConstraintScorer', () => {
  it('boosts alpha for hard admissibility action', () => {
    const out = ConstraintScorer.calculateScore('upgrade_vehicle_to_4wd', {
      dominant_cid: 'REACHABILITY_HARD',
      is_hard: true,
      oscillation_k: 0,
      precedent: {
        case_id: 'x',
        summary: 'N=10',
        sample_count: 10,
        late_accept_count: 10,
        stats: { historical_late_accept_rate: 1, wall_hit_distance_p90_latency_ms: 180_000 },
      },
    });
    expect(out.weights.alpha).toBeGreaterThanOrEqual(10); // 6*1.8=10.8
  });

  it('increases gamma when oscillation_k > 1', () => {
    const a = ConstraintScorer.calculateScore('drop_one_must_include_poi', { oscillation_k: 1 });
    const b = ConstraintScorer.calculateScore('drop_one_must_include_poi', { oscillation_k: 3 });
    expect(b.weights.gamma).toBeGreaterThan(a.weights.gamma);
  });
});

