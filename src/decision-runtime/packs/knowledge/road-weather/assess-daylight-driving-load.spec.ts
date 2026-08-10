import { assessDaylightDrivingLoad } from './assess-daylight-driving-load';
import { aggregateIcelandSelfDriveDomains } from './aggregate-cross-domain';
import { assessVehicleRoadFit } from './assess-vehicle-road-fit';
import { loadIcelandDaylightDrivingPolicy } from './iceland-road-weather.loader';
import { evaluateIcelandSelfDriveSituation } from '../demo/evaluate-iceland-self-drive-situation';

describe('assessDaylightDrivingLoad', () => {
  it('loads policy thresholds', () => {
    const policy = loadIcelandDaylightDrivingPolicy();
    expect(policy.nightExposureWarnMinutes).toBe(60);
    expect(policy.winterBufferMinutes).toBe(45);
    expect(policy.fullLoadStack?.nightMinutes).toBe(90);
  });

  it('warns when night exposure exceeds threshold', () => {
    const a = assessDaylightDrivingLoad({
      nightExposureMinutes: 75,
      sameDayDriveMinutes: 60,
    });
    expect(a.gate).toBe('NEED_CONFIRM');
    expect(a.reasons).toContain('NIGHT_EXPOSURE_ABOVE_WARN');
    expect(a.stack.nightWarn).toBe(true);
  });

  it('stacks 90min night + 4h drive + morning booking → NEED_CONFIRM / end early', () => {
    const a = assessDaylightDrivingLoad({
      nightExposureMinutes: 90,
      sameDayDriveMinutes: 240,
      nextMorningBooking: true,
      unfamiliarRoad: true,
      weatherBand: 'default',
      latestArrivalHotelLocalMin: 21 * 60,
      remainingDriveMinutes: 90,
      civilDawnLocalMin: 8 * 60,
      civilDuskLocalMin: 17 * 60,
    });
    expect(a.gate).toBe('NEED_CONFIRM');
    expect(a.stack.fullLoadStack).toBe(true);
    expect(a.reasons).toContain('NIGHT_LOAD_BOOKING_STACK');
    expect(a.recommendedActions).toEqual(
      expect.arrayContaining(['END_DAY_EARLIER', 'CONFIRM_NIGHT_LOAD_STACK']),
    );
    expect(a.latestDepartureLocalMin).toBeDefined();
    // 1260 - 90 - 45 = 1125 (18:45) without night penalty? nightWarn is true so -9
    expect(a.latestDepartureLocalMin!).toBeLessThanOrEqual(21 * 60 - 90 - 45);
    expect(a.suggestedDrivingWindow?.startLocalMin).toBe(8 * 60);
    expect(a.suggestedDrivingWindow?.endLocalMin).toBe(17 * 60);
  });

  it('does not invent driving window without SunCalc inputs', () => {
    const a = assessDaylightDrivingLoad({
      nightExposureMinutes: 30,
    });
    expect(a.suggestedDrivingWindow).toBeUndefined();
    expect(a.latestDepartureLocalMin).toBeUndefined();
    expect(a.gate).toBe('ALLOW');
  });

  it('feeds into situation evaluate + aggregate', () => {
    const result = evaluateIcelandSelfDriveSituation({
      scenarioId: 'DAYLIGHT_STACK',
      vehicleRoadFit: {
        vehicleClass: 'SEDAN',
        roadSegmentId: 'RING_ROAD',
        roadBaseType: 'PAVED',
        roadStatus: 'OPEN',
        driverExperience: 'BASIC',
      },
      daylight: {
        nightExposureMinutes: 90,
        sameDayDriveMinutes: 240,
        nextMorningBooking: true,
        unfamiliarRoad: true,
        remainingDriveMinutes: 100,
        latestArrivalHotelLocalMin: 21 * 60,
      },
      executeFuelRunbookOnBlock: false,
    });
    expect(result.daylightLoad?.stack.fullLoadStack).toBe(true);
    expect(result.verdict.gate).toBe('NEED_CONFIRM');
    expect(result.verdict.primaryActions).toEqual(
      expect.arrayContaining(['END_DAY_EARLIER']),
    );
  });

  it('cross-domain includes daylight conditional in stack count', () => {
    const fit = assessVehicleRoadFit({
      vehicleClass: 'SUV_4WD',
      roadSegmentId: 'F208',
      roadBaseType: 'F_ROAD',
      roadStatus: 'OPEN',
      seasonOpen: true,
      driverExperience: 'BASIC',
    });
    const daylight = assessDaylightDrivingLoad({
      nightExposureMinutes: 90,
      sameDayDriveMinutes: 240,
      nextMorningBooking: true,
    });
    const agg = aggregateIcelandSelfDriveDomains({
      vehicleRoadFit: fit,
      daylightLoad: daylight,
      fuelStatus: 'WARN',
      fuelReliabilityUnknown: true,
    });
    expect(agg.reasons).toEqual(
      expect.arrayContaining(['NIGHT_LOAD_BOOKING_STACK']),
    );
    expect(['NEED_CONFIRM', 'REPLAN_REQUIRED']).toContain(agg.status);
  });
});
