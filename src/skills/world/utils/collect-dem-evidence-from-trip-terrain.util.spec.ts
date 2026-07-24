import { collectDemEvidenceFromTripTerrain } from './collect-dem-evidence-from-trip-terrain.util';
import { TRAVEL_ETA_CONTRACT_SCHEMA } from '../../../transport/contracts/travel-eta.contract';

describe('collectDemEvidenceFromTripTerrain', () => {
  it('returns [] when no terrain stamped', () => {
    expect(
      collectDemEvidenceFromTripTerrain({
        TripDay: [{ ItineraryItem: [{ id: 'a', metadata: {} }] }],
      }),
    ).toEqual([]);
  });

  it('builds LIVE demEvidence from travelEta.terrain', () => {
    const evidences = collectDemEvidenceFromTripTerrain(
      {
        TripDay: [
          {
            ItineraryItem: [
              {
                id: 'f208-east',
                metadata: {
                  travelEta: {
                    schema: TRAVEL_ETA_CONTRACT_SCHEMA,
                    baseDurationMin: 125,
                    planningDurationMin: 165,
                    uncertaintyMin: 40,
                    confidence: 0.7,
                    adjustmentReasons: ['F_ROAD'],
                    provenance: {
                      provider: 'MAPBOX',
                      sourceKind: 'ROUTE_API',
                      calculatedAt: '2026-07-17T00:00:00.000Z',
                      cacheHit: false,
                      confidence: 0.7,
                    },
                    terrain: {
                      ascentM: 640,
                      descentM: 420,
                      avgSlopePct: 4,
                      maxSlopePct: 14,
                      sampleCount: 40,
                      demSource: 'geo_dem_iceland_20m',
                      resolutionM: 20,
                      srid: 5327,
                      confidence: 0.98,
                      geometrySource: 'ROUTE_API',
                    },
                  },
                },
              },
            ],
          },
        ],
      },
      { tripId: 'trip-1' },
    );

    expect(evidences).toHaveLength(1);
    expect(evidences[0].segmentId).toBe('item_f208-east');
    expect(evidences[0].cumulativeAscent).toBe(640);
    expect(evidences[0].maxSlopePct).toBe(14);
    expect(evidences[0].violation).toBe('NONE');
    expect(evidences[0].dataProvenance).toBe('LIVE');
  });

  it('marks HARD when demSource is NONE', () => {
    const evidences = collectDemEvidenceFromTripTerrain({
      TripDay: [
        {
          ItineraryItem: [
            {
              id: 'x',
              metadata: {
                terrain: {
                  ascentM: 0,
                  descentM: 0,
                  avgSlopePct: 0,
                  maxSlopePct: 0,
                  sampleCount: 0,
                  demSource: 'NONE',
                  confidence: 0,
                  geometrySource: 'NONE',
                },
              },
            },
          ],
        },
      ],
    });
    expect(evidences[0].violation).toBe('HARD');
  });
});
