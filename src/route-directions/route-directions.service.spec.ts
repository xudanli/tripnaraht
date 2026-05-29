import { RouteDirectionsService } from './route-directions.service';

const mockHikingTrailDetail = {
  isHikingRoute: jest.fn().mockReturnValue(false),
  build: jest.fn(),
  buildListCardFields: jest.fn().mockReturnValue({}),
} as any;

function mockTx(txImpl: {
  routeDirection: { update: jest.Mock };
  routeTemplate: { updateMany: jest.Mock };
}) {
  return jest.fn(async (fn: (tx: typeof txImpl) => Promise<unknown>) => fn(txImpl));
}

describe('RouteDirectionsService — deleteRouteDirection', () => {
  it('soft-deletes direction and deactivates all its templates', async () => {
    const routeDirection = { update: jest.fn().mockResolvedValue({}) };
    const routeTemplate = {
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    };
    const tx = { routeDirection, routeTemplate };
    const prisma = {
      $transaction: mockTx(tx),
    } as any;

    const svc = new RouteDirectionsService(prisma, mockHikingTrailDetail);
    await svc.deleteRouteDirection(42);

    expect(routeDirection.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { isActive: false },
    });
    expect(routeTemplate.updateMany).toHaveBeenCalledWith({
      where: { routeDirectionId: 42 },
      data: { isActive: false },
    });
  });
});

describe('RouteDirectionsService — updateRouteDirection', () => {
  it('deactivates templates when direction is set inactive', async () => {
    const routeDirection = {
      update: jest.fn().mockResolvedValue({ id: 1, isActive: false }),
    };
    const routeTemplate = {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    };
    const prisma = {
      routeDirection: {
        findUnique: jest.fn().mockResolvedValue({ id: 1, name: 'x' }),
      },
      $transaction: mockTx({ routeDirection, routeTemplate }),
    } as any;

    const svc = new RouteDirectionsService(prisma, mockHikingTrailDetail);
    await svc.updateRouteDirection(1, { isActive: false } as any);

    expect(routeTemplate.updateMany).toHaveBeenCalledWith({
      where: { routeDirectionId: 1 },
      data: { isActive: false },
    });
  });

  it('does not touch templates when only updating other fields', async () => {
    const routeDirection = {
      update: jest.fn().mockResolvedValue({ id: 1 }),
    };
    const routeTemplate = { updateMany: jest.fn() };
    const prisma = {
      routeDirection: {
        findUnique: jest.fn().mockResolvedValue({ id: 1, name: 'x' }),
      },
      $transaction: mockTx({ routeDirection, routeTemplate }),
    } as any;

    const svc = new RouteDirectionsService(prisma, mockHikingTrailDetail);
    await svc.updateRouteDirection(1, { nameCN: '仅改名' } as any);

    expect(routeTemplate.updateMany).not.toHaveBeenCalled();
  });
});
