import {
  buildContextBlocksFromCountryFacts,
  contextBlockTypeToTopic,
} from './country-profile-context-blocks';
import type { CountryFacts } from '../../trips/readiness/compilers/facts-to-readiness.compiler';

describe('country-profile-context-blocks', () => {
  const isFacts: CountryFacts = {
    isoCode: 'IS',
    nameCN: '冰岛',
    schemaVersion: 2,
    entryRequirements: {
      byNationality: {
        CN: {
          status: 'VISA_REQUIRED',
          statusLabelCN: '需要签证',
          schengenZone: true,
          visaApplicationLeadTimeDays: 45,
        },
        US: {
          status: 'VISA_FREE',
          statusLabel: 'Visa-free',
          allowedStay: '90 days',
        },
      },
    },
    complianceInfo: {
      droneRules: {
        allowed: true,
        maxAltitudeMeter: 120,
        requiresRegistration: true,
        restrictions: ['禁止在国家公园内飞行'],
      },
      drivingRules: {
        requires4x4ForFRoad: true,
        requiresInternationalLicense: true,
        gravelRoadPresent: true,
        speedLimits: {
          algorithmEtaPenaltyCoefficients: { gravelRoad: 1.4, fRoad: 2.0 },
        },
      },
    },
    timeBoundaries: {
      seasons: [
        {
          name: 'SUMMER_MIDNIGHT_SUN',
          months: [6, 7, 8],
          avgDaylightHours: 21,
          outdoorRoutingWindow: { start: '06:00', end: '23:00' },
        },
      ],
      environmentalTriggers: {
        autoRerouteTriggers: ['WIND_SPEED_OVER_20MS'],
        weatherAlertSource: 'https://www.vedur.is/',
      },
    },
    emergency: { police: '112', fire: '112', medical: '112' },
    paymentType: 'DIGITAL_ONLY',
    paymentInfo: { tipping: '无需小费' },
    powerInfo: { plugTypes: ['C', 'F'], voltage: 230, frequency: 50 },
  };

  it('builds COUNTRY_VISA for CN nationality', () => {
    const blocks = buildContextBlocksFromCountryFacts(isFacts, {
      topics: ['VISA'],
      travelerNationality: 'CN',
      tripStartDate: '2026-07-15',
    });
    const visa = blocks.find((b) => b.type === 'COUNTRY_VISA');
    expect(visa).toBeDefined();
    expect(visa?.text).toMatch(/CN|中国|签证|Schengen/i);
    expect(visa?.data?.derivedFrom).toBe('findings');
    expect(visa?.dataSource).toBe('FACTS');
  });

  it('builds different VISA text for US nationality', () => {
    const cn = buildContextBlocksFromCountryFacts(isFacts, {
      topics: ['VISA'],
      travelerNationality: 'CN',
    });
    const us = buildContextBlocksFromCountryFacts(isFacts, {
      topics: ['VISA'],
      travelerNationality: 'US',
    });
    expect(cn[0]?.text).not.toEqual(us[0]?.text);
    expect(us[0]?.text).toMatch(/visa-free|US/i);
  });

  it('builds ROAD_RULES and WEATHER_WINDOWS', () => {
    const blocks = buildContextBlocksFromCountryFacts(isFacts, {
      topics: ['ROAD_RULES', 'WEATHER_WINDOWS'],
      tripStartDate: '2026-07-15',
    });
    expect(blocks.some((b) => b.type === 'COUNTRY_ROAD_RULES')).toBe(true);
    expect(blocks.some((b) => b.type === 'COUNTRY_WEATHER')).toBe(true);
  });

  it('builds DRONE from complianceInfo', () => {
    const blocks = buildContextBlocksFromCountryFacts(isFacts, { topics: ['DRONE'] });
    const drone = blocks.find((b) => b.type === 'COUNTRY_DRONE');
    expect(drone?.text).toMatch(/120/);
    expect(drone?.provenance.source).toBe('db');
  });

  it('maps block types back to topics', () => {
    expect(contextBlockTypeToTopic('COUNTRY_VISA')).toBe('VISA');
    expect(contextBlockTypeToTopic('COUNTRY_WEATHER')).toBe('WEATHER_WINDOWS');
  });
});
