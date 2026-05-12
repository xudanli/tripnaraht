import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DecisionFactorFactoryService } from '../decision-factor.factory';
import { TripExplainabilityService } from './trip-explainability.service';

describe('TripExplainabilityService', () => {
  const factory = new DecisionFactorFactoryService();

  it('extractCountryCode parses ISO and underscore prefix', () => {
    const cfg = { get: jest.fn() } as unknown as ConfigService;
    const svc = new TripExplainabilityService({} as any, {} as any, cfg, factory);
    expect(svc.extractCountryCode('IS')).toBe('IS');
    expect(svc.extractCountryCode('is_winter')).toBe('IS');
    expect(svc.extractCountryCode('Reykjavik')).toBeUndefined();
  });

  it('buildTripExplainability throws when trip missing', async () => {
    const prisma = {
      trip: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const cfg = { get: jest.fn() } as unknown as ConfigService;
    const svc = new TripExplainabilityService(prisma as any, {} as any, cfg, factory);
    await expect(svc.buildTripExplainability({ tripId: 'x' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('buildTripExplainability returns unresolved when destination not ISO', async () => {
    const prisma = {
      trip: {
        findUnique: jest.fn().mockResolvedValue({
          id: 't1',
          destination: 'Reykjavik',
          metadata: {},
        }),
      },
    };
    const resolver = { resolveLatestBySubjectPredicate: jest.fn() };
    const cfg = { get: jest.fn().mockReturnValue('poc/v1') } as unknown as ConfigService;
    const svc = new TripExplainabilityService(prisma as any, resolver as any, cfg, factory);
    const out = await svc.buildTripExplainability({ tripId: 't1' });
    expect(out.destinationCountryUnresolved).toBe(true);
    expect(out.decisionFactors).toEqual([]);
  });
});
