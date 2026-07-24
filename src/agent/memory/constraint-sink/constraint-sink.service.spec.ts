import { ConfigService } from '@nestjs/config';
import { ConstraintSinkService } from './constraint-sink.service';
import type { TripTaskMemoryService } from '../../context-engine/services/trip-task-memory.service';

describe('ConstraintSinkService', () => {
  let service: ConstraintSinkService;
  let tripTaskMemory: jest.Mocked<Pick<TripTaskMemoryService, 'get' | 'update'>>;

  beforeEach(() => {
    tripTaskMemory = {
      get: jest.fn().mockResolvedValue({ constraints: {}, history: [] }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    service = new ConstraintSinkService(tripTaskMemory as any, {
      get: (key: string) => (key === 'FEATURE_MEMORY_CONSTRAINT_SINK' ? '1' : undefined),
    } as ConfigService);
  });

  it('extractAndPatch writes constraint_sink_v1 on coastal pivot message', async () => {
    const result = await service.extractAndPatch({
      sessionId: 'sess-1',
      tripId: 'trip-iceland',
      userId: 'user-1',
      messageId: 'msg-1',
      message: '不去南岸了，改去内陆',
    });
    expect(result.applied).toBe(true);
    expect(result.patch_ids).toHaveLength(1);
    expect(tripTaskMemory.update).toHaveBeenCalledWith(
      'trip-iceland',
      expect.objectContaining({
        constraints: expect.objectContaining({
          constraint_sink_v1: expect.objectContaining({
            patches: expect.arrayContaining([
              expect.objectContaining({
                delta: expect.objectContaining({
                  destination_pivot: expect.objectContaining({ to: 'highlands' }),
                }),
              }),
            ]),
          }),
        }),
      }),
    );
  });

  it('skips when feature flag off', async () => {
    const off = new ConstraintSinkService(tripTaskMemory as any, {
      get: () => '0',
    } as ConfigService);
    const result = await off.extractAndPatch({
      sessionId: 's',
      tripId: 't',
      userId: 'u',
      messageId: 'm',
      message: '不去南岸',
    });
    expect(result.skipped_reason).toBe('feature_off');
    expect(tripTaskMemory.update).not.toHaveBeenCalled();
  });

  it('schedule returns immediately without awaiting slow extract (TC-SINK-03)', async () => {
    tripTaskMemory.update = jest.fn(
      () => new Promise<void>(resolve => setTimeout(resolve, 500)),
    );
    const prom = { recordConstraintSinkPatchApplied: jest.fn() };
    const asyncSvc = new ConstraintSinkService(
      tripTaskMemory as any,
      {
        get: (key: string) => (key === 'FEATURE_MEMORY_CONSTRAINT_SINK' ? '1' : undefined),
      } as ConfigService,
      prom as any,
    );

    const t0 = Date.now();
    asyncSvc.schedule({
      sessionId: 'sess',
      tripId: 'trip-1',
      userId: 'user-1',
      messageId: 'msg',
      message: '不去南岸了，改去内陆',
    });
    expect(Date.now() - t0).toBeLessThan(20);

    await new Promise<void>(resolve => setImmediate(resolve));
    await new Promise<void>(resolve => setTimeout(resolve, 600));
    expect(tripTaskMemory.update).toHaveBeenCalled();
  });
});
