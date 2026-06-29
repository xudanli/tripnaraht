import type { CountryProfile } from '@prisma/client';
import { findCountryProfileCompat } from './country-profile-compat.util';

describe('findCountryProfileCompat', () => {
  it('falls back to legacy select when V2 columns are missing', async () => {
    const legacyRow = {
      isoCode: 'IS',
      nameCN: '冰岛',
      nameEN: 'Iceland',
      powerInfo: null,
      emergency: null,
      paymentInfo: null,
      visaForCN: null,
      updatedAt: new Date('2026-01-01'),
      currencyCode: 'ISK',
      currencyName: null,
      exchangeRateToCNY: null,
      paymentType: null,
      exchangeRateToUSD: null,
      complianceInfo: null,
      travelCulture: null,
    };

    const prisma = {
      countryProfile: {
        findUnique: jest
          .fn()
          .mockRejectedValueOnce(
            new Error(
              'The column `CountryProfile.schemaVersion` does not exist in the current database.',
            ),
          )
          .mockResolvedValueOnce(legacyRow),
      },
    } as unknown as import('@prisma/client').PrismaClient;

    const profile = await findCountryProfileCompat(prisma, 'IS');

    expect(profile?.isoCode).toBe('IS');
    expect(profile?.schemaVersion).toBe(2);
    expect(profile?.timeBoundaries).toBeNull();
    expect(prisma.countryProfile.findUnique).toHaveBeenCalledTimes(2);
    expect(prisma.countryProfile.findUnique).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { isoCode: 'IS' },
        select: expect.objectContaining({ isoCode: true, nameCN: true }),
      }),
    );
  });
});
