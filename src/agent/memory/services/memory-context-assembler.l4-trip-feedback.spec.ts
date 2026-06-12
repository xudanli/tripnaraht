import { Test, TestingModule } from '@nestjs/testing';
import { MemoryContextAssemblerService } from './memory-context-assembler.service';
import { MemoryService } from './memory.service';
import { WORLD_DECISION_MEMORY_ARCHIVE } from '../decision-memory/world-decision-memory-archive.port';
import type { RouteAndRunRequestDto } from '../../dto/route-and-run.dto';

describe('MemoryContextAssemblerService (L4 trip feedback)', () => {
  const getUserTripFeedbacksTail = jest.fn();

  beforeEach(() => {
    getUserTripFeedbacksTail.mockReset();
  });

  it('loads L4 recentTripFeedbacks tail=3 via MemoryService', async () => {
    getUserTripFeedbacksTail.mockResolvedValue([
      {
        tripId: 'trip-a',
        userId: 'u-l4',
        overallSuccess: true,
        fatigueLevel: 5,
        satisfaction: 2,
        abandoned: false,
        failurePoints: ['long_drive'],
        createdAt: new Date('2026-06-09T00:00:00.000Z'),
      },
    ]);

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        MemoryContextAssemblerService,
        {
          provide: MemoryService,
          useValue: {
            getUserTravelProfile: jest.fn().mockResolvedValue(null),
            getUserRouteDirectionDecisions: jest.fn().mockResolvedValue([]),
            getRouteDirectionHealth: jest.fn().mockResolvedValue(null),
            getUserTripFeedbacksTail,
          },
        },
        {
          provide: WORLD_DECISION_MEMORY_ARCHIVE,
          useValue: { isEnabled: () => false, persist: jest.fn(), listRecentForTrip: jest.fn() },
        },
      ],
    }).compile();

    const asm = moduleRef.get(MemoryContextAssemblerService);
    const ctx = await asm.loadForRouteAndRun({
      request_id: 'req-l4',
      user_id: 'u-l4',
    } as RouteAndRunRequestDto);

    expect(getUserTripFeedbacksTail).toHaveBeenCalledWith('u-l4', 3);
    expect(ctx.recentTripFeedbacks).toHaveLength(1);
    expect(ctx.recentTripFeedbacks[0]).toMatchObject({
      tripId: 'trip-a',
      satisfactionScore: 2,
      fatigueLevel: 'HIGH',
      primaryTags: ['long_drive'],
    });
    expect(ctx.observability.layers).toEqual(expect.arrayContaining(['L4_trip_feedback']));
  });

  it('records L4_load_error without blocking assembly', async () => {
    getUserTripFeedbacksTail.mockRejectedValue(new Error('l4 db down'));

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        MemoryContextAssemblerService,
        {
          provide: MemoryService,
          useValue: {
            getUserTravelProfile: jest.fn().mockResolvedValue(null),
            getUserRouteDirectionDecisions: jest.fn().mockResolvedValue([]),
            getRouteDirectionHealth: jest.fn().mockResolvedValue(null),
            getUserTripFeedbacksTail,
          },
        },
        {
          provide: WORLD_DECISION_MEMORY_ARCHIVE,
          useValue: { isEnabled: () => false, persist: jest.fn(), listRecentForTrip: jest.fn() },
        },
      ],
    }).compile();

    const asm = moduleRef.get(MemoryContextAssemblerService);
    const ctx = await asm.loadForRouteAndRun({
      request_id: 'req-l4-err',
      user_id: 'u-l4',
    } as RouteAndRunRequestDto);

    expect(ctx.recentTripFeedbacks).toEqual([]);
    expect(ctx.observability.metadata?.L4_load_error).toBe('l4 db down');
  });
});
