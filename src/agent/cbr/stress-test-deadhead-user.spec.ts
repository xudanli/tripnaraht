import { LocalCaseStoreService } from './local-case-store.service';
import { ConstraintScorer } from './constraint-scorer.util';
import { SignatureBuilder } from './signature-builder.util';

describe('Stress test — deadhead user (Iceland F-road)', () => {
  it('oscillation raises gamma; targeted rejection updates persuasion; delta damped at tiny samples', () => {
    const store = new LocalCaseStoreService();

    // Signature: Iceland April, reachability hard (2WD vs F-road admissibility)
    const sig = SignatureBuilder.buildConversionSignature({
      conflict_type: 'REACHABILITY',
      primary_violation_type: 'REACHABILITY_HARD',
      region_id: 'is',
      month: 4,
    });

    // Precedent: N=12 similar cases, late-accept very high, wall-hit cost high
    const precedent: any = {
      case_id: 'agg:reachability',
      summary: 'N=12',
      sample_count: 12,
      late_accept_count: 11,
      stats: {
        historical_late_accept_rate: 11 / 12,
        wall_hit_distance_p90_latency_ms: 240_000,
      },
    };

    // Round 1: show options, user proceeds-at-own-risk (rejects top)
    store.recordConversion({ signature: sig, action: 'upgrade_vehicle_to_4wd', kind: 'shown' });
    store.recordConversion({ signature: sig, action: 'drop_one_must_include_poi', kind: 'shown' });
    store.recordConversion({ signature: sig, action: 'proceed_at_own_risk', kind: 'proceeded' });
    store.recordConversion({ signature: sig, action: 'upgrade_vehicle_to_4wd', kind: 'rejected' }); // targeted top rejection

    const p1 = store.getPersuasionRate({ signature: sig, action: 'upgrade_vehicle_to_4wd' });
    expect(p1.shown_count).toBe(1);
    // Laplace smoothing prevents 0/1 -> 0; should be (0+1)/(1+2)=0.333...
    expect(p1.rate).toBeCloseTo(1 / 3, 3);

    const s1 = ConstraintScorer.calculateScore('upgrade_vehicle_to_4wd', {
      dominant_cid: 'REACHABILITY_HARD',
      is_hard: true,
      oscillation_k: 1,
      precedent,
      persuasion: p1,
      delta: 1.5,
      preset: 'ICELAND_HARD',
    });
    // shown_count<3 => delta damped
    expect(s1.weights.delta).toBeCloseTo(0.75, 6);

    // Round 3 oscillation: gamma should rise (k>1)
    const s3 = ConstraintScorer.calculateScore('upgrade_vehicle_to_4wd', {
      dominant_cid: 'REACHABILITY_HARD',
      is_hard: true,
      oscillation_k: 3,
      precedent,
      persuasion: p1,
      delta: 1.5,
      preset: 'ICELAND_HARD',
    });
    expect(s3.weights.gamma).toBeGreaterThan(s1.weights.gamma);

    // Hard anchoring: alpha boosted for the admissibility action
    expect(s3.weights.alpha).toBeGreaterThan(6);
  });
});

