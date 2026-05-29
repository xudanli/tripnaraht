import { FactsToReadinessCompiler, type CountryFacts } from './facts-to-readiness.compiler';
import type { TripContext } from '../types/trip-context.types';

describe('FactsToReadinessCompiler V2', () => {
  const compiler = new FactsToReadinessCompiler();

  const baseContext: TripContext = {
    traveler: { nationality: 'CN' },
    trip: { startDate: '2026-07-15', endDate: '2026-07-22' },
    itinerary: { countries: ['IS'], activities: ['self_drive'] },
  };

  const isFactsV2: CountryFacts = {
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
      drivingRules: {
        requires4x4ForFRoad: true,
        requiresInternationalLicense: true,
        minAge: 17,
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
          recommendedCarType: 'ANY',
        },
      ],
      environmentalTriggers: {
        autoRerouteTriggers: ['WIND_SPEED_OVER_20MS'],
        weatherAlertSource: 'https://www.vedur.is/',
      },
    },
    travelCulture: {
      experienceRules: [
        {
          targetPoiCategory: 'HOT_SPRING',
          requirementsCN: ['必须淋浴'],
        },
      ],
    },
  };

  it('compiles visa lead time for traveler nationality (CN)', () => {
    const r = compiler.compile(isFactsV2, baseContext);
    const visa = r.must.find((i) => i.id.includes('entry.visa.CN'));
    expect(visa).toBeDefined();
    expect(visa?.tasks?.[0]?.dueOffsetDays).toBe(-45);
    expect(visa?.tasks?.[0]?.tags).toContain('schengen');
  });

  it('compiles visa-free for US passport on Iceland', () => {
    const r = compiler.compile(isFactsV2, {
      ...baseContext,
      traveler: { nationality: 'US' },
    });
    expect(r.optional.some((i) => i.id.includes('entry.visa-free.US'))).toBe(true);
  });

  it('compiles summer season window for July trip', () => {
    const r = compiler.compile(isFactsV2, baseContext);
    expect(r.should.some((i) => i.id.includes('SUMMER_MIDNIGHT_SUN'))).toBe(true);
  });

  it('compiles F-road 4wd must item', () => {
    const r = compiler.compile(isFactsV2, baseContext);
    expect(r.must.some((i) => i.id.includes('f-road-4wd'))).toBe(true);
  });

  it('compiles experience rules', () => {
    const r = compiler.compile(isFactsV2, baseContext);
    expect(r.must.some((i) => i.id.includes('HOT_SPRING'))).toBe(true);
  });
});
