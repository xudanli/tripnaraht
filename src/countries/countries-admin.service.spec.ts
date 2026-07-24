import { mergeV2SeedPatch, parseAndValidateV2Seed } from './country-profile-v2.mapper';
import type { CountryProfile } from '@prisma/client';

describe('CountriesAdminService merge', () => {
  const baseRow = {
    isoCode: 'IS',
    nameCN: '冰岛',
    nameEN: 'Iceland',
    schemaVersion: 2,
    currencyCode: 'ISK',
    currencyName: '冰岛克朗',
    exchangeRateToCNY: 0.05,
    exchangeRateToUSD: 0.008,
    paymentType: 'DIGITAL_ONLY',
    paymentInfo: { tipping: '无需小费' },
    powerInfo: { voltage: 230 },
    emergency: { police: '112' },
    entryRequirements: { byNationality: { CN: { status: 'VISA_REQUIRED' } } },
    complianceInfo: { drivingRules: { drivingSide: 'RIGHT' } },
    travelCulture: null,
    timeBoundaries: { daylightFluctuation: true },
    updatedAt: new Date(),
  } as CountryProfile;

  it('merges complianceInfo shallowly on patch', () => {
    const seed = mergeV2SeedPatch(baseRow, {
      complianceInfo: {
        drivingRules: { leftHandDrivingEtaBuffer: 0.05 },
      },
    });
    expect(seed.complianceInfo?.drivingRules).toMatchObject({
      drivingSide: 'RIGHT',
      leftHandDrivingEtaBuffer: 0.05,
    });
  });

  it('validates full v2 seed', () => {
    const seed = parseAndValidateV2Seed({
      schemaVersion: 2,
      isoCode: 'NZ',
      nameCN: '新西兰',
    });
    expect(seed.isoCode).toBe('NZ');
  });
});
