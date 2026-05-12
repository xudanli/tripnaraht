import { buildRoadConstraintGraph } from './road-constraint.graph';
import {
  propagateRoadConstraint,
  type RoadConstraintEvent,
} from './road-constraint.propagation';
import { ICELAND_ROAD_POI_BINDINGS_MVP } from './road-poi.binding';

describe('propagateRoadConstraint (iceland-road MVP)', () => {
  const graph = buildRoadConstraintGraph(ICELAND_ROAD_POI_BINDINGS_MVP);

  it('IMPASSABLE closes road and lists dependent POIs', () => {
    const ev: RoadConstraintEvent = {
      roadId: 'F208',
      status: 'IMPASSABLE',
    };
    const impact = propagateRoadConstraint(graph, ev);
    expect(impact.blockedRoads).toEqual(['F208']);
    expect(impact.affectedPOIs).toEqual(
      expect.arrayContaining(['LANDMANNALAUGAR', 'LANDMANNALAUGAR_HUTS']),
    );
    expect(impact.requiresReplan).toBe(true);
    expect(impact.severity).toBe('HIGH');
  });

  it('unknown road returns empty impact', () => {
    const impact = propagateRoadConstraint(graph, {
      roadId: 'F999',
      status: 'IMPASSABLE',
    });
    expect(impact.affectedPOIs).toHaveLength(0);
    expect(impact.requiresReplan).toBe(false);
  });
});
