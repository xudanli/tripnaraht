import {
  assessIcelandWinterKnowledge,
  assessSnowPlowDelay,
  assessLodgingHours,
} from './assess-iceland-winter-knowledge';
import { loadIcelandSnowPlowPolicy } from './iceland-snow-plow.loader';
import { evaluateIcelandSelfDriveSituation } from '../demo/evaluate-iceland-self-drive-situation';
import { projectIcelandSelfDriveSituationClient } from '../demo/iceland-self-drive-situation.client';

describe('Iceland winter knowledge slices', () => {
  it('loads snow plow policy codes', () => {
    const policy = loadIcelandSnowPlowPolicy();
    expect(policy.plowRuleCodes.EKKI_MOKAD.serviceBand).toBe('NOT_PLOWED');
    expect(policy.plowRuleCodes['7X'].delayRangeMinutes).toEqual([0, 30]);
  });

  it('maps plow rule code to delay range without inventing a point', () => {
    const a = assessSnowPlowDelay({ plowRuleCode: '7X', roadSegmentId: 'RING_ROAD' });
    expect(a.plowServiceBand).toBe('DAILY');
    expect(a.plowDelayRangeMin).toEqual([0, 30]);
    expect(a.gate).toBe('ALLOW');
  });

  it('lodging hours unknown → NEED_CONFIRM', () => {
    const a = assessLodgingHours({ openingMode: 'UNKNOWN', hoursUnknown: true });
    expect(a.gate).toBe('NEED_CONFIRM');
    expect(a.reasons).toContain('LODGING_HOURS_UNKNOWN');
  });

  it('projects winter slices onto situation client for iOS', () => {
    const situation = evaluateIcelandSelfDriveSituation({
      tripId: 'trip_winter_1',
      scenarioId: 'WINTER_SLICES',
      vehicleRoadFit: {
        vehicleClass: 'SUV_4WD',
        roadSegmentId: 'RING_ROAD',
        roadBaseType: 'PAVED',
        roadStatus: 'OPEN',
      },
      winter: {
        attractionAccess: {
          poiId: 'is.skaftafell',
          status: 'PENDING_CONFIRMATION',
          enforcement: 'SOFT',
        },
        activityRisk: {
          experienceCode: 'EXP_ICE_CAVE_TOUR',
          weatherDependency: 'CRITICAL',
          cancelReasonCodes: ['high_wind', 'cave_access_closed'],
          sessionStatus: 'WEATHER_HOLD',
        },
        snowPlow: { plowRuleCode: 'EKKI_MOKAD', roadSegmentId: 'RING_ROAD' },
        lodging: { openingMode: 'UNKNOWN', hoursUnknown: true },
      },
      executeFuelRunbookOnBlock: false,
    });

    const client = projectIcelandSelfDriveSituationClient(situation, {
      tripId: 'trip_winter_1',
    });

    expect(client.attractionAccess?.poiId).toBe('is.skaftafell');
    expect(client.attractionAccess?.status).toBe('PENDING_CONFIRMATION');
    expect(client.activityRisk?.sessionStatus).toBe('WEATHER_HOLD');
    expect(client.activityRisk?.cancelReasonCodes).toContain('high_wind');
    expect(client.road?.plowServiceBand).toBe('NOT_PLOWED');
    expect(client.lodging?.hoursUnknown).toBe(true);
    expect(client.gate).toBe('NEED_CONFIRM');
    expect(
      assessIcelandWinterKnowledge({
        lodging: { openingMode: 'KNOWN' },
      }).lodging?.gate,
    ).toBe('ALLOW');
  });
});
