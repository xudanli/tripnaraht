import { buildGlobalGraphFromWorldContext } from './global-graph-from-world.util';
import { runCgusSubgraphPreflight } from './cgus-subgraph-preflight.util';
import type { WorldModelContext } from '../shared/world-model.types';
import type { CGUSCandidate } from '../optimization/cgus-search.service';

describe('cgus-subgraph-preflight', () => {
  const worldContext: WorldModelContext = {
    physical: {
      demEvidence: [],
      roadStates: [{ roadId: 'F208', status: 'SEASONAL', requires4x4: true, seasonOpenFrom: 6, seasonOpenTo: 9 }],
      hazardZones: [],
      ferryStates: [],
      countryCode: 'IS',
      month: 10,
    },
    human: {
      profileId: 't',
      maxDailyAscentM: 400,
      rollingAscent3DaysM: 900,
      maxSlopePct: 15,
      preferredPace: 'SLOW',
      riskTolerance: 'LOW',
      highAltitudeExperience: 'NONE',
    },
    routeDirection: { id: 'r', countryCode: 'IS', name: 'r', nameCN: 'r', nameEN: 'r', tags: [] },
  };

  it('builds Iceland F-road nodes and runs preflight', () => {
    const graph = buildGlobalGraphFromWorldContext(worldContext.physical, {
      segments: [{ segmentId: 's1', dayIndex: 1, distanceKm: 50, ascentM: 100, slopePct: 8 }],
    });
    expect(graph.nodes.some((n) => n.id === 'road:F208')).toBe(true);

    const candidates: CGUSCandidate[] = [
      {
        id: 'plan-base',
        plan: {
          tripId: 't1',
          routeDirectionId: 'r',
          segments: [
            {
              segmentId: 'seg-f208',
              dayIndex: 1,
              distanceKm: 50,
              ascentM: 100,
              slopePct: 8,
              graphRelations: { fromPlaceId: 'road:F208', graphNodeId: 'seg:seg-f208' },
            },
          ],
        },
        constraintViolations: [],
        feasible: true,
      },
    ];
    const result = runCgusSubgraphPreflight({
      worldContext,
      candidates,
      month: 10,
      vehicleType: '2WD',
    });
    expect(result.worldContext.subgraphExtraction?.stats.nodeCount).toBeGreaterThan(0);
  });
});
