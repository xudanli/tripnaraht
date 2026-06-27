import { NotFoundException } from '@nestjs/common';
import { ExperienceRegretBoundService } from './experience-regret-bound.service';

describe('ExperienceRegretBoundService', () => {
  const prisma = {
    trip: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const service = new ExperienceRegretBoundService(prisma as any);

  it('returns 404 for legacy trip without experienceUnderstanding', async () => {
    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-legacy',
      metadata: {},
    });

    await expect(
      service.confirmBound('trip-legacy', 'user-1', { confirmedUpperBound: 0.3 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
