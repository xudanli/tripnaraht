import {
  runWeatherDeteriorationDetection,
} from './weather-loop.orchestrator';

describe('p1-weather-deterioration detection', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it('opens decision for high-roof + orange wind on exposed segment', () => {
    delete process.env.ONTOLOGY_P1_WEATHER_DETERIORATION_KILL_SWITCH;
    delete process.env.ONTOLOGY_AUTHORITY_SEMANTIC_KILL_SWITCH;

    const result = runWeatherDeteriorationDetection({
      tripId: 'trip_is_south_coast_demo',
      plan: {
        tripId: 'trip_is_south_coast_demo',
        revision: 1,
        vehicleClass: 'HIGH_ROOF_CAMPER',
        segments: [
          {
            segmentId: 'seg_south_coast',
            regionIds: ['south_coast'],
            windExposed: true,
            outdoorActivity: true,
            itineraryItemId: 'act_glacier',
          },
        ],
      },
      observations: [
        {
          regionId: 'south_coast',
          subjectId: 'south_coast',
          warningLevel: 'ORANGE',
          observedAt: '2026-07-17T09:00:00.000Z',
          tripId: 'trip_is_south_coast_demo',
          country: 'IS',
        },
      ],
      nowMs: Date.parse('2026-07-17T09:05:00.000Z'),
    });

    expect(result.impact?.warningLevel).toBe('ORANGE');
    expect(result.assessment).toBeTruthy();
    expect(result.decisionProblem?.semanticScope).toBe('WEATHER_DETERIORATION');
    expect(result.repairCandidates.length).toBeGreaterThan(0);
    expect(result.decisionScope?.snapshotId).toBe(result.worldStateSnapshotId);
    expect(result.decisionScope?.trigger).toBe('WEATHER_DETERIORATION_STRONG_WIND');
    expect(
      result.repairCandidates.every((c) => c.secondaryValidation.verified === false),
    ).toBe(true);
  });
});
