import { buildPredictedEdgeFingerprints, deriveCalibrationSignals } from './flywheel-risk-feedback';

describe('flywheel-risk-feedback', () => {
  it('buildPredictedEdgeFingerprints returns primaryFactors + bullets', () => {
    const edges: any[] = [
      {
        edge: {
          id: 'e1',
          from: 'A',
          to: 'B',
          travel_time: 5,
          road_open: 1,
          water_crossing_depth_cm: 80,
          surface_type: 'mud',
          steepness_grade_pct: 25,
          exposure: 1,
        },
      },
    ];
    const predicted = buildPredictedEdgeFingerprints({ edges, weatherRisk01: 0.9, windSpeedMs: 18 });
    expect(predicted[0]?.edgeId).toBe('e1');
    expect(predicted[0]?.primaryFactors.length).toBeGreaterThan(0);
    expect(predicted[0]?.bullets.length).toBeGreaterThan(0);
  });

  it('deriveCalibrationSignals emits decrease when predicted water extreme but observed shallow', () => {
    const predicted = [
      {
        edgeId: 'e1',
        breakdown: {
          total: 9,
          components: { weather: 1, water: 8, terrain: 0.5, froad_base: 0 },
          metadata: { critical_factors: ['water_crossing_depth_cm'], is_hard_closed: false },
        },
        primaryFactors: ['water_crossing_depth_cm'],
        bullets: [],
      },
    ] as any;
    const observed = [{ edgeId: 'e1', observedWaterDepthCm: 10, avgSpeedKmh: 45 }];
    const sig = deriveCalibrationSignals({ predicted, observed });
    expect(sig.some((s) => s.factor === 'water_crossing' && s.direction === 'DECREASE')).toBe(true);
  });
});

