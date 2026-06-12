import { Test, TestingModule } from '@nestjs/testing';
import { MemoryContextAssemblerService } from './memory-context-assembler.service';
import { MemoryService } from './memory.service';
import { TripTaskMemoryService } from '../../context-engine/services/trip-task-memory.service';
import { WORLD_DECISION_MEMORY_ARCHIVE } from '../decision-memory/world-decision-memory-archive.port';
import type { RouteAndRunRequestDto } from '../../dto/route-and-run.dto';

describe('MemoryContextAssemblerService (L3 route health)', () => {
  const getRouteDirectionHealth = jest.fn();

  beforeEach(() => {
    getRouteDirectionHealth.mockReset();
  });

  async function buildModule() {
    return Test.createTestingModule({
      providers: [
        MemoryContextAssemblerService,
        {
          provide: MemoryService,
          useValue: {
            getUserTravelProfile: jest.fn().mockResolvedValue(null),
            getUserRouteDirectionDecisions: jest.fn().mockResolvedValue([
              {
                id: 'd1',
                userId: 'u1',
                countryCode: 'IS',
                month: 7,
                selectedRouteDirectionId: 123,
                rejectedRouteDirectionIds: [],
                keyConstraints: {},
                scoreBreakdown: {},
                explanation: { whySelected: '', whyRejected: [], riskPoints: [] },
                createdAt: new Date(),
              },
            ]),
            getRouteDirectionHealth,
            getUserTripFeedbacksTail: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: TripTaskMemoryService,
          useValue: {
            get: jest.fn().mockResolvedValue({
              tripId: 'trip-1',
              currentPhase: 'decision',
              selectedRouteDirectionId: '123',
              decisionLogSummary: '',
              artifactsRefs: [],
              lastUpdated: new Date().toISOString(),
            }),
          },
        },
        {
          provide: WORLD_DECISION_MEMORY_ARCHIVE,
          useValue: { isEnabled: () => false, persist: jest.fn(), listRecentForTrip: jest.fn() },
        },
      ],
    }).compile();
  }

  it('loads L3 into failurePatterns and routeHealthByKey', async () => {
    getRouteDirectionHealth.mockResolvedValue({
      routeDirectionId: 123,
      countryCode: 'IS',
      totalRuns: 12,
      successRuns: 4,
      failureRuns: 8,
      commonFailureReasons: ['fatigue_overload', 'visa_policy'],
      commonRepairs: ['split_day'],
      lastUpdated: new Date(),
    });

    const moduleRef = await buildModule();
    const asm = moduleRef.get(MemoryContextAssemblerService);
    const req = {
      request_id: 'req-l3',
      user_id: 'u1',
      trip_id: 'trip-1',
      structured_travel_input: { destination_country: 'IS' } as any,
    } as RouteAndRunRequestDto;

    const ctx = await asm.loadForRouteAndRun(req);

    expect(getRouteDirectionHealth).toHaveBeenCalledWith(123, 'IS');
    expect(ctx.observability.layers).toEqual(expect.arrayContaining(['L3_route_health']));
    expect(ctx.failurePatterns).toEqual(['fatigue_overload:1', 'visa_policy:1']);
    expect(ctx.activeRouteHealthSnapshot?.routeDirectionId).toBe(123);
    expect(ctx.activeRouteHealthSnapshot?.countryCode).toBe('IS');
    expect(ctx.routeHealthByKey?.['123_IS']?.successRate).toBeCloseTo(4 / 12);
  });

  it('does not block assembly when L3 load throws', async () => {
    getRouteDirectionHealth.mockRejectedValue(new Error('db down'));

    const moduleRef = await buildModule();
    const asm = moduleRef.get(MemoryContextAssemblerService);
    const req = {
      request_id: 'req-l3-fail',
      user_id: 'u1',
      trip_id: 'trip-1',
      structured_travel_input: { destination_country: 'IS' } as any,
    } as RouteAndRunRequestDto;

    const ctx = await asm.loadForRouteAndRun(req);

    expect(ctx.failurePatterns).toEqual([]);
    expect(ctx.activeRouteHealthSnapshot).toBeNull();
    expect(ctx.observability.metadata?.L3_load_error_123_IS).toBe('db down');
  });
});
