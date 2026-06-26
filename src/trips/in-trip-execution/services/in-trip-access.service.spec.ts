import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InTripAccessService } from './in-trip-access.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('InTripAccessService', () => {
  let service: InTripAccessService;
  const prisma = { trip: { findUnique: jest.fn() } };

  beforeEach(async () => {
    jest.clearAllMocks();
    delete process.env.IN_TRIP_EXECUTION_ENABLED;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InTripAccessService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(InTripAccessService);
  });

  it('assertModuleEnabled throws when feature flag is off', () => {
    expect(() => service.assertModuleEnabled()).toThrow(ServiceUnavailableException);
  });

  it('assertInTripPhase requires TRAVELING when module enabled', async () => {
    process.env.IN_TRIP_EXECUTION_ENABLED = 'true';
    prisma.trip.findUnique.mockResolvedValue({
      id: 't1',
      status: 'PLANNING',
      TripCollaborator: [],
      metadata: {},
    });

    await expect(service.assertInTripPhase('t1')).rejects.toThrow(BadRequestException);
  });
});
