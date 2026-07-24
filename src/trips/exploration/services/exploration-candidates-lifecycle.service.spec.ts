import { ExplorationCandidatesLifecycleService } from './exploration-candidates-lifecycle.service';
import { EXPLORATION_ROUTE_VARIANT_STATUS } from '../constants/exploration-status.constants';

describe('ExplorationCandidatesLifecycleService', () => {
  const prisma = {
    explorationRouteVariant: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const service = new ExplorationCandidatesLifecycleService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('returns READY when draft variants exist', async () => {
    prisma.explorationRouteVariant.findMany.mockResolvedValue([{ generationVersion: 1 }]);
    prisma.explorationRouteVariant.findFirst.mockResolvedValue(null);
    prisma.explorationRouteVariant.count.mockResolvedValue(0);

    const status = await service.getStatus('scn-1');
    expect(status.status).toBe('READY');
    expect(status.activeCount).toBe(1);
    expect(status.generationVersion).toBe(1);
  });

  it('returns STALE when only archived variants remain', async () => {
    prisma.explorationRouteVariant.findMany.mockResolvedValue([]);
    prisma.explorationRouteVariant.findFirst.mockResolvedValue(null);
    prisma.explorationRouteVariant.count.mockResolvedValue(3);

    const status = await service.getStatus('scn-1');
    expect(status.status).toBe('STALE');
    expect(status.activeCount).toBe(0);
  });

  it('returns SELECTED when a route is chosen', async () => {
    prisma.explorationRouteVariant.findMany.mockResolvedValue([]);
    prisma.explorationRouteVariant.findFirst.mockResolvedValue({
      routeId: 'route_depth-south-coast',
      generationVersion: 2,
    });
    prisma.explorationRouteVariant.count.mockResolvedValue(3);

    const status = await service.getStatus('scn-1');
    expect(status.status).toBe('SELECTED');
    expect(status.selectedRouteId).toBe('route_depth-south-coast');
  });

  it('invalidates draft variants', async () => {
    prisma.explorationRouteVariant.updateMany.mockResolvedValue({ count: 3 });
    const n = await service.invalidateDrafts('scn-1');
    expect(n).toBe(3);
    expect(prisma.explorationRouteVariant.updateMany).toHaveBeenCalledWith({
      where: { scenarioId: 'scn-1', status: EXPLORATION_ROUTE_VARIANT_STATUS.DRAFT },
      data: { status: EXPLORATION_ROUTE_VARIANT_STATUS.ARCHIVED },
    });
  });

  it('bumps generation version from history', async () => {
    prisma.explorationRouteVariant.findMany.mockResolvedValue([
      { generationVersion: 1 },
      { generationVersion: 2 },
    ]);
    await expect(service.nextGenerationVersion('scn-1')).resolves.toBe(3);
  });
});
