import { ICELAND_ROAD_DEPENDENCY_GRAPH_V0 } from './iceland-road-dependency-graph.v0';
import { propagateRoadConstraintsV0 } from './road-constraint-propagation';
import { roadConstraintImpactToSemanticDeltaV0 } from './road-constraint-semantic-bridge';
import { validateSemanticDeltaImpactV0 } from '../execution/semantic-delta-impact-matrix';

describe('propagateRoadConstraintsV0', () => {
  it('F208 IMPASSABLE marks Landmannalaugar POIs and requires replan', () => {
    const impact = propagateRoadConstraintsV0(
      [{ roadId: 'F208', accessState: 'IMPASSABLE' }],
      ICELAND_ROAD_DEPENDENCY_GRAPH_V0,
    );
    expect(impact.affectedPOIs).toEqual(
      expect.arrayContaining(['poi:landmannalaugar', 'poi:landmannalaugar-huts']),
    );
    expect(impact.replanRequired).toBe(true);
    expect(impact.severity).toBe('STRUCTURAL');
  });

  it('RESTRICTED_4WD without vehicle is soft: POIs listed, no forced replan', () => {
    const impact = propagateRoadConstraintsV0(
      [{ roadId: 'F208', accessState: 'RESTRICTED_4WD' }],
      ICELAND_ROAD_DEPENDENCY_GRAPH_V0,
    );
    expect(impact.affectedPOIs.length).toBeGreaterThan(0);
    expect(impact.replanRequired).toBe(false);
    expect(impact.severity).toBe('ADVISORY');
  });

  it('RESTRICTED_4WD + SEDAN-equivalent class forces hard propagation', () => {
    const impact = propagateRoadConstraintsV0(
      [{ roadId: 'F208', accessState: 'RESTRICTED_4WD' }],
      ICELAND_ROAD_DEPENDENCY_GRAPH_V0,
      { vehicleClass: 'SEDAN' },
    );
    expect(impact.replanRequired).toBe(true);
    expect(impact.severity).toBe('STRUCTURAL');
  });

  it('RESTRICTED_4WD + SUV_4WD does not propagate from graph', () => {
    const impact = propagateRoadConstraintsV0(
      [{ roadId: 'F208', accessState: 'RESTRICTED_4WD' }],
      ICELAND_ROAD_DEPENDENCY_GRAPH_V0,
      { vehicleClass: 'SUV_4WD' },
    );
    expect(impact.affectedPOIs).toHaveLength(0);
    expect(impact.replanRequired).toBe(false);
  });
});

describe('roadConstraintImpactToSemanticDeltaV0', () => {
  it('produces valid SEMANTIC_DELTA with PHYSICAL domain', () => {
    const delta = roadConstraintImpactToSemanticDeltaV0({
      affectedPOIs: ['poi:x'],
      affectedSegments: ['F208'],
      affectedDays: ['2026-07-01'],
      severity: 'STRUCTURAL',
      replanRequired: true,
      triggerRoadIds: ['F208'],
    });
    expect(delta.kind).toBe('ROAD_CONSTRAINT_CHANGE');
    const v = validateSemanticDeltaImpactV0(delta);
    expect(v.ok).toBe(true);
  });
});
