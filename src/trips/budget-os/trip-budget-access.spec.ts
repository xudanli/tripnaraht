import { ForbiddenException } from '@nestjs/common';
import { TripBudgetAccessService } from './services/trip-budget-access.service';

describe('TripBudgetAccessService', () => {
  const tripId = 'trip-auth';
  const prisma = {
    trip: {
      findUnique: jest.fn(),
    },
  };
  let service: TripBudgetAccessService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TripBudgetAccessService(prisma as never);
  });

  it('allows OWNER to modify budget', async () => {
    prisma.trip.findUnique.mockResolvedValue({
      id: tripId,
      metadata: {},
      TripCollaborator: [{ userId: 'u1', role: 'OWNER' }],
    });
    await expect(service.assertCanModifyBudget(tripId, 'u1')).resolves.toBeUndefined();
  });

  it('rejects VIEWER from modifying budget', async () => {
    prisma.trip.findUnique.mockResolvedValue({
      id: tripId,
      metadata: {},
      TripCollaborator: [{ userId: 'u1', role: 'VIEWER' }],
    });
    await expect(service.assertCanModifyBudget(tripId, 'u1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows metadata owner to modify budget', async () => {
    prisma.trip.findUnique.mockResolvedValue({
      id: tripId,
      metadata: { userId: 'meta-owner' },
      TripCollaborator: [],
    });
    await expect(service.assertCanModifyBudget(tripId, 'meta-owner')).resolves.toBeUndefined();
  });
});
