import { projectIcelandSelfDriveSituationClient } from './iceland-self-drive-situation.client';
import { buildIcelandSelfDriveSituationClientFromCaseFlags } from './build-iceland-self-drive-situation.client';
import { evaluateIcelandSelfDriveSituation } from './evaluate-iceland-self-drive-situation';

describe('IcelandSelfDriveSituationClient BFF projection', () => {
  it('projects gate, delay range, and causalChain for iOS', () => {
    const situation = evaluateIcelandSelfDriveSituation({
      tripId: 'trip_ios_1',
      scenarioId: 'CLIENT_BFF_TEST',
      vehicleRoadFit: {
        vehicleClass: 'CAMPERVAN',
        roadSegmentId: 'RING_ROAD',
        roadBaseType: 'PAVED',
        roadStatus: 'OPEN',
        windExposure: 'HIGH',
        weatherBand: 'severe',
      },
      weather: {
        weatherEventId: 'wx_1',
        phenomenon: 'GUST',
        windGustMs: 24,
        affectedRoadSegments: ['RING_ROAD'],
        vehicleClass: 'CAMPERVAN',
        roadExposure: 'HIGH',
      },
      executeFuelRunbookOnBlock: false,
    });

    const client = projectIcelandSelfDriveSituationClient(situation, {
      tripId: 'trip_ios_1',
    });

    expect(client.schemaId).toBe('tripnara.iceland.self_drive_situation.client@v1');
    expect(client.gate).toBeDefined();
    expect(client.vehicleRoadFit?.gate).toBeDefined();
    expect(client.weather?.causalChain.length).toBeGreaterThanOrEqual(3);
    expect(client.weather?.delayRangeMin?.[0]).toBeLessThanOrEqual(
      client.weather!.delayRangeMin![1],
    );
    expect(client.deepLink?.problemIdHint).toBe('dc_vehicle_trip_ios_1');
    expect(client.weather?.causalChain.some((s) => s.summaryZh.length > 0)).toBe(true);
  });

  it('builds client projection from case flags without inventing gust', () => {
    const client = buildIcelandSelfDriveSituationClientFromCaseFlags({
      tripId: 'trip_ios_2',
      hasFRoad: true,
      hasGravel: false,
      highWind: true,
      vehicleType: 'SUV_4WD',
      fRoadIdHint: 'F208',
      fRoadAllowed: true,
    });
    expect(client).toBeDefined();
    expect(client!.weather?.weatherEventId).toBeTruthy();
    expect(client!.weather?.effectivePhenomenon).toMatch(/STRONG_WIND|强侧风/);
    // No measured gust → no invented windGustMs on input; delay still a range
    expect(client!.weather?.delayRangeMin).toBeDefined();
  });

  it('projects insurance Coverage Gap and prefers insurance deepLink', () => {
    const client = buildIcelandSelfDriveSituationClientFromCaseFlags({
      tripId: 'trip_ios_ins',
      hasFRoad: true,
      hasGravel: true,
      highWind: true,
      vehicleType: 'SUV_4WD',
      coverageTier: 'BASIC',
    });
    expect(client?.insurance?.hasGap).toBe(true);
    expect(client?.insurance?.fordAlwaysExcluded).toBe(true);
    expect(client?.insurance?.fordingExcluded).toBe(true);
    expect(client?.insurance?.coverageTier).toBe('BASIC');
    expect(client?.insurance?.routeExposure.fRoad).toBe(true);
    expect(
      client?.insurance?.gaps.some(
        (g) => g.code === 'FORD_EXCLUDED' || g.dimension === 'WATER_FORDING',
      ),
    ).toBe(true);
    expect(client?.deepLink?.problemIdHint).toBe('dc_insurance_trip_ios_ins');
    expect(client?.deepLink?.semanticKeyHint).toBe(
      'REQUIRED_CHOICE.RENTAL_INSURANCE',
    );
    expect(client?.summary.includes('aggregate=')).toBe(false);
    expect(client?.vehicleRoadFit?.fitStatus).toBeDefined();
    expect(client?.vehicleRoadFit?.vehicleLabel).toBeTruthy();
  });
});
