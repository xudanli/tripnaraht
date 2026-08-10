import { aggregateIcelandSelfDriveDomains } from './aggregate-cross-domain';
import { assessDrivingWeatherImpact } from './assess-driving-weather-impact';
import {
  assessVehicleRoadFit,
  mapTerrainScenarioToRoadBaseType,
} from './assess-vehicle-road-fit';
import {
  loadIcelandDaylightDrivingPolicy,
  loadIcelandRegulationSeverityItems,
  loadIcelandVehicleRoadMatrix,
  loadIcelandWeatherDrivingPolicy,
} from './iceland-road-weather.loader';
import { runRoadWeatherCertification } from './road-weather-certification.harness';

describe('Iceland Road/Weather Standardization (WP4)', () => {
  it('loads matrix, weather policy, daylight strategy, regulation severity', () => {
    expect(loadIcelandVehicleRoadMatrix().cells.length).toBeGreaterThanOrEqual(30);
    expect(loadIcelandWeatherDrivingPolicy().status).toBe('ACTIVE');
    expect(loadIcelandDaylightDrivingPolicy().nightExposureWarnMinutes).toBe(60);
    expect(loadIcelandRegulationSeverityItems().map((i) => i.topicId)).toEqual(
      expect.arrayContaining([
        'driving_eligibility',
        'off_road',
        'alcohol',
        'winter_equipment',
      ]),
    );
  });

  it('F-road + 4WD is conditional, not auto-allow', () => {
    const result = assessVehicleRoadFit({
      vehicleClass: 'SUV_4WD',
      roadSegmentId: 'F208',
      roadBaseType: 'F_ROAD',
      roadStatus: 'OPEN',
      seasonOpen: true,
    });
    expect(result.gate).toBe('NEED_CONFIRM');
    expect(result.status).toBe('CONDITIONAL');
    expect(result.conditionsToProceed.length).toBeGreaterThan(0);
  });

  it('maps legacy terrain scenarios onto road base types', () => {
    expect(mapTerrainScenarioToRoadBaseType('GENERAL_PAVED_CORRIDOR')).toBe('PAVED');
    expect(mapTerrainScenarioToRoadBaseType('F_ROAD_WET_GRAVEL')).toBe('F_ROAD');
    expect(mapTerrainScenarioToRoadBaseType('HIGH_CROSSWIND_PASS')).toBe(
      'WIND_EXPOSED',
    );
  });

  it('weather impact uses delay ranges not a single fake minute', () => {
    const impact = assessDrivingWeatherImpact({
      weatherEventId: 'e1',
      phenomenon: 'GUST',
      windGustMs: 22,
      affectedRoadSegments: ['IS-R1'],
      vehicleClass: 'CAMPERVAN',
      roadExposure: 'HIGH',
    });
    const range = impact.impacts.drivingSpeed?.estimatedDelayRangeMin;
    expect(range).toBeDefined();
    expect(range![0]).toBeLessThanOrEqual(range![1]);
    expect(impact.temporalImpact.assumptions).toContain('delay_is_range_not_point');
    expect(impact.recommendedActions.some((a) => a.includes('ETA_MAY_INCREASE'))).toBe(
      true,
    );
    expect(impact.causalChain.length).toBeGreaterThanOrEqual(3);
    expect(impact.causalChain.some((s) => s.code === 'EXPECT_LOWER_AVERAGE_SPEED')).toBe(
      true,
    );
    expect(impact.causalChain.some((s) => s.code.includes('ETA_DELAY'))).toBe(true);
  });

  it('inexperienced drivers and longer segments widen delay ranges', () => {
    const base = assessDrivingWeatherImpact({
      weatherEventId: 'e_base',
      phenomenon: 'STRONG_WIND',
      windGustMs: 19,
      affectedRoadSegments: ['IS-R1'],
      vehicleClass: 'SEDAN',
      roadExposure: 'LOW',
      driverExperience: 'EXPERIENCED',
      segmentLengthKm: 80,
    });
    const noviceLong = assessDrivingWeatherImpact({
      weatherEventId: 'e_novice',
      phenomenon: 'STRONG_WIND',
      windGustMs: 19,
      affectedRoadSegments: ['IS-R1'],
      vehicleClass: 'SEDAN',
      roadExposure: 'LOW',
      driverExperience: 'NONE',
      segmentLengthKm: 160,
    });
    const baseLo = base.impacts.drivingSpeed!.estimatedDelayRangeMin![0];
    const noviceLo = noviceLong.impacts.drivingSpeed!.estimatedDelayRangeMin![0];
    expect(noviceLo).toBeGreaterThan(baseLo);
    expect(noviceLong.effectivePhenomenon).toBe('STRONG_WIND');
  });

  it('stacks secondary phenomena into MULTI with booking-miss causal step', () => {
    const impact = assessDrivingWeatherImpact({
      weatherEventId: 'e_multi',
      phenomenon: 'GUST',
      windGustMs: 24,
      additionalPhenomena: ['LOW_VISIBILITY'],
      visibilityM: 300,
      affectedRoadSegments: ['F208'],
      vehicleClass: 'SUV_4WD',
      roadExposure: 'HIGH',
      driverExperience: 'BASIC',
      segmentLengthKm: 120,
      isNight: true,
    });
    expect(impact.effectivePhenomenon).toBe('MULTI');
    expect(impact.impacts.routeSafety?.status).toBe('BLOCK');
    expect(
      impact.causalChain.some((s) => s.code === 'MAY_MISS_ACTIVITY_OR_BOOKING_WINDOW'),
    ).toBe(true);
  });

  it('cross-domain stacked conditionals force REPLAN_REQUIRED', () => {
    const fit = assessVehicleRoadFit({
      vehicleClass: 'SUV_4WD',
      roadSegmentId: 'F208',
      roadBaseType: 'F_ROAD',
      roadStatus: 'LIMITED',
      seasonOpen: true,
      driverExperience: 'BASIC',
    });
    const weather = assessDrivingWeatherImpact({
      weatherEventId: 'e2',
      phenomenon: 'GUST',
      windGustMs: 24,
      affectedRoadSegments: ['F208'],
      vehicleClass: 'SUV_4WD',
      roadExposure: 'HIGH',
    });
    const agg = aggregateIcelandSelfDriveDomains({
      vehicleRoadFit: fit,
      weatherImpact: weather,
      fuelStatus: 'WARN',
      fuelReliabilityUnknown: true,
    });
    expect(agg.status).toBe('REPLAN_REQUIRED');
    expect(agg.reasons).toContain('CROSS_DOMAIN_STACKED_CONDITIONAL');
  });

  it('passes road/weather certification suite', () => {
    const report = runRoadWeatherCertification();
    const failed = report.results.filter((r) => !r.passed);
    expect(failed).toEqual([]);
    expect(report.total).toBeGreaterThanOrEqual(14);
  });
});
