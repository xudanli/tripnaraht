import { edgeRiskBreakdown } from './environmental-milp-builder';
import { explainEdgeRisk } from './risk-explanation.engine';

describe('risk-explanation.engine', () => {
  it('emits deep water warning when water component is high', () => {
    const edge: any = {
      from: 'A',
      to: 'B',
      travel_time: 5,
      road_open: 1,
      weatherRisk: 0.2,
      exposure: 0.2,
      water_crossing_depth_cm: 80,
    };
    const breakdown = edgeRiskBreakdown(edge, 0.1);
    const out = explainEdgeRisk({ breakdown, edge });
    expect(out.bullets.join(' ')).toMatch(/涉水/);
    expect(out.primaryFactors).toEqual(expect.arrayContaining(['water_crossing_depth_cm']));
  });

  it('emits mud+steepness traction warning when terrain is high', () => {
    const edge: any = {
      from: 'A',
      to: 'B',
      travel_time: 5,
      road_open: 1,
      weatherRisk: 0.3,
      exposure: 0.2,
      surface_type: 'mud',
      steepness_grade_pct: 25,
    };
    const breakdown = edgeRiskBreakdown(edge, 0.1);
    const out = explainEdgeRisk({ breakdown, edge });
    expect(out.bullets.join(' ')).toMatch(/泥泞/);
    expect(out.primaryFactors).toEqual(expect.arrayContaining(['surface_type', 'steepness_grade_pct']));
  });

  it('emits wind/exposure warning when weather component is high', () => {
    const edge: any = {
      from: 'A',
      to: 'B',
      travel_time: 5,
      road_open: 1,
      weatherRisk: 0.95,
      exposure: 1,
    };
    const breakdown = edgeRiskBreakdown(edge, 0.95);
    const out = explainEdgeRisk({ breakdown, edge, env: { windSpeedMs: 18.2 } });
    expect(out.bullets.join(' ')).toMatch(/强风/);
    expect(out.primaryFactors).toEqual(expect.arrayContaining(['weatherRisk', 'exposure']));
  });
});

