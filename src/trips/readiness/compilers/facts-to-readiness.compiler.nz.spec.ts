import { FactsToReadinessCompiler, type CountryFacts } from './facts-to-readiness.compiler';
import type { TripContext } from '../types/trip-context.types';

describe('FactsToReadinessCompiler NZ V2', () => {
  const compiler = new FactsToReadinessCompiler();

  const nzFacts: CountryFacts = {
    isoCode: 'NZ',
    nameCN: '新西兰',
    schemaVersion: 2,
    entryRequirements: {
      byNationality: {
        CN: {
          status: 'VISA_REQUIRED',
          statusLabelCN: '需要签证',
          visaApplicationLeadTimeDays: 25,
          nzetaAvailableForPassports: ['HKG', 'SGP'],
        },
      },
    },
    complianceInfo: {
      biosecurityPolicy: {
        declarationRequired: true,
        declarationPlatform: 'NZTD',
        instantFineAmountNZD: 400,
        prohibitedItems: ['新鲜水果'],
      },
      drivingRules: {
        drivingSide: 'LEFT',
        leftHandDrivingEtaBuffer: 0.15,
        minAge: 21,
      },
    },
    timeBoundaries: {
      seasons: [
        {
          name: 'SUMMER_PEAK_LIGHT_SOUTH',
          months: [12, 1, 2],
          outdoorRoutingWindow: { start: '06:00', end: '21:00' },
        },
      ],
    },
    travelCulture: {
      experienceRules: [
        { targetPoiCategory: 'FREEDOM_CAMPING', requirementsCN: ['蓝色自主循环标签'] },
      ],
    },
  };

  const ctx: TripContext = {
    traveler: { nationality: 'CN' },
    trip: { startDate: '2026-01-10' },
    itinerary: { countries: ['NZ'], activities: ['self_drive'] },
  };

  it('compiles biosecurity must', () => {
    const r = compiler.compile(nzFacts, ctx);
    expect(r.must.some((i) => i.id.includes('biosecurity'))).toBe(true);
  });

  it('compiles left-hand driving buffer for self_drive', () => {
    const r = compiler.compile(nzFacts, ctx);
    expect(r.should.some((i) => i.id.includes('left-hand-buffer'))).toBe(true);
  });

  it('compiles southern summer season for January', () => {
    const r = compiler.compile(nzFacts, ctx);
    expect(r.should.some((i) => i.id.includes('SUMMER_PEAK_LIGHT_SOUTH'))).toBe(true);
  });
});
