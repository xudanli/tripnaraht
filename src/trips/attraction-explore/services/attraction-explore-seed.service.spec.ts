import { AttractionExploreSeedService } from './attraction-explore-seed.service';

describe('AttractionExploreSeedService', () => {
  function build(prisma: Record<string, unknown>, candidates: Record<string, unknown>) {
    return new AttractionExploreSeedService(prisma as never, candidates as never);
  }

  it('seedFromIcelandSelfDriveRegions skips when candidates already exist', async () => {
    const prisma = {
      tripAttractionExploreCandidate: {
        count: jest.fn().mockResolvedValue(3),
      },
    };
    const candidates = {
      seedCandidates: jest.fn(),
    };
    const svc = build(prisma, candidates);

    const count = await svc.seedFromIcelandSelfDriveRegions({
      tripId: 'trip-1',
      placeIds: [1, 2],
      regionIds: ['south_coast'],
    });

    expect(count).toBe(0);
    expect(candidates.seedCandidates).not.toHaveBeenCalled();
  });

  it('seedFromIcelandSelfDriveRegions seeds with iceland_self_drive sourceRef', async () => {
    const prisma = {
      tripAttractionExploreCandidate: {
        count: jest.fn().mockResolvedValue(0),
      },
      trip: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          metadata: { source: 'iceland_self_drive' },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const candidates = {
      seedCandidates: jest.fn().mockResolvedValue(2),
    };
    const svc = build(prisma, candidates);

    const count = await svc.seedFromIcelandSelfDriveRegions({
      tripId: 'trip-1',
      placeIds: [10, 20, 10],
      regionIds: ['south_coast'],
    });

    expect(count).toBe(2);
    expect(candidates.seedCandidates).toHaveBeenCalledWith(
      'trip-1',
      [10, 20],
      'route_seed',
      { mode: 'iceland_self_drive', regionIds: ['south_coast'] },
      'very_interested',
    );
    expect(prisma.trip.update).toHaveBeenCalled();
  });

  it('ensureBootstrapCandidates allows iceland_self_drive source', async () => {
    const prisma = {
      trip: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'trip-1',
          destination: 'IS',
          metadata: { source: 'iceland_self_drive' },
        }),
      },
      tripAttractionExploreCandidate: {
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const candidates = {
      seedCandidates: jest.fn(),
    };
    const svc = build(prisma, candidates);

    const count = await svc.ensureBootstrapCandidates('trip-1');
    expect(count).toBe(0);
    expect(prisma.tripAttractionExploreCandidate.count).toHaveBeenCalled();
  });
});
