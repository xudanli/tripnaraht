import { RouteDirectionsController } from './route-directions.controller';

describe('RouteDirectionsController — deleteRouteDirection', () => {
  let controller: RouteDirectionsController;
  let routeDirectionsService: { deleteRouteDirection: jest.Mock };

  beforeEach(() => {
    routeDirectionsService = {
      deleteRouteDirection: jest.fn().mockResolvedValue(undefined),
    };

    const noop = {} as any;

    controller = new RouteDirectionsController(
      routeDirectionsService as any,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
    );
  });

  it('calls service with id and returns standard success with null data', async () => {
    const res = await controller.deleteRouteDirection(7);

    expect(routeDirectionsService.deleteRouteDirection).toHaveBeenCalledTimes(1);
    expect(routeDirectionsService.deleteRouteDirection).toHaveBeenCalledWith(7);
    expect(res).toEqual({ success: true, data: null });
  });

  it('maps failures to standard error response', async () => {
    routeDirectionsService.deleteRouteDirection.mockRejectedValueOnce(new Error('boom'));

    const res = await controller.deleteRouteDirection(1);

    expect(res.success).toBe(false);
    expect(res.error?.code).toBe('INTERNAL_ERROR');
    expect(res.error?.message).toBe('Failed to delete route direction');
  });
});
