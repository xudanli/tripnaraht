import { ItineraryRevisionRegretService } from './itinerary-revision-regret.service';

describe('ItineraryRevisionRegretService', () => {
  it('prefers alternative_id on the ROLLBACK row itself', async () => {
    const prisma = {
      itineraryRevision: {
        findFirst: jest.fn().mockResolvedValue({
          alternativeId: 'POSTPONE_SCHEDULE',
          parentRevisionId: 'parent-1',
        }),
        findUnique: jest.fn(),
      },
    } as any;
    const svc = new ItineraryRevisionRegretService(prisma);
    await expect(svc.getAlternativeIdSupersededByLatestRollback('trip-x')).resolves.toBe('POSTPONE_SCHEDULE');
    expect(prisma.itineraryRevision.findUnique).not.toHaveBeenCalled();
  });

  it('falls back to parent alternative_id when ROLLBACK row has no alternativeId', async () => {
    const prisma = {
      itineraryRevision: {
        findFirst: jest.fn().mockResolvedValue({ alternativeId: null, parentRevisionId: 'parent-1' }),
        findUnique: jest.fn().mockResolvedValue({ alternativeId: 'POSTPONE_SCHEDULE' }),
      },
    } as any;
    const svc = new ItineraryRevisionRegretService(prisma);
    await expect(svc.getAlternativeIdSupersededByLatestRollback('trip-x')).resolves.toBe('POSTPONE_SCHEDULE');
  });

  it('returns null without prisma', async () => {
    const svc = new ItineraryRevisionRegretService(undefined);
    await expect(svc.getAlternativeIdSupersededByLatestRollback('t')).resolves.toBeNull();
  });
});
