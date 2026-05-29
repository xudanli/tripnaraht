import { HttpException } from '@nestjs/common';
import { TripOrchestrationLockService } from './trip-orchestration-lock.service';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

describe('TripOrchestrationLockService — Phase 2 STALE_PLAN_VERSION', () => {
  const tripRunManager = {
    resolveLatestServerDsoVersionForTrip: jest.fn(),
  };

  const service = new TripOrchestrationLockService(undefined, tripRunManager as any);

  const writeReq = {
    request_id: 'req-b',
    message: '改行程',
    trip_id: '11111111-1111-1111-1111-111111111111',
    options: { client_dso_version: 10 },
  } as RouteAndRunRequestDto;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.TRIP_ORCHESTRATION_LOCK_ENABLED = '1';
  });

  it('skips stale check when client_dso_version omitted', async () => {
    const req = { ...writeReq, options: {} } as RouteAndRunRequestDto;
    await expect(
      service.runWithTripWriteLockIfNeeded(req, async () => 'ok'),
    ).resolves.toBe('ok');
    expect(tripRunManager.resolveLatestServerDsoVersionForTrip).not.toHaveBeenCalled();
  });

  it('throws STALE_PLAN_VERSION before lock when server ahead (no distributed lock)', async () => {
    tripRunManager.resolveLatestServerDsoVersionForTrip.mockResolvedValue(11);
    await expect(
      service.runWithTripWriteLockIfNeeded(writeReq, async () => 'ok'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'STALE_PLAN_VERSION',
        client_dso_version: 10,
        server_dso_version: 11,
      }),
    });
    expect(tripRunManager.resolveLatestServerDsoVersionForTrip).toHaveBeenCalled();
  });

  it('allows when client version matches server', async () => {
    tripRunManager.resolveLatestServerDsoVersionForTrip.mockResolvedValue(10);
    await expect(
      service.runWithTripWriteLockIfNeeded(writeReq, async () => 'ok'),
    ).resolves.toBe('ok');
  });
});
