import {
  convertToTripPlanRequest,
  hydrateTripPlanRequestFromTripRecord,
  normalizeTripRecordDestinationForPlanning,
} from './intake-trip-plan-request.runner';
import type { IntakeTripPlanRequestHost } from './intake-trip-plan-request.host';
import type { OrchestratorState, TripPlanRequest } from '../interfaces/trip-plan.interface';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

describe('intake-trip-plan-request.runner', () => {
  it('normalizeTripRecordDestinationForPlanning maps ISO codes', () => {
    expect(normalizeTripRecordDestinationForPlanning('IS')).toBe('冰岛');
    expect(normalizeTripRecordDestinationForPlanning('jp')).toBe('日本');
    expect(normalizeTripRecordDestinationForPlanning('Reykjavik')).toBe('Reykjavik');
  });

  it('convertToTripPlanRequest extracts Iceland destination from NL', () => {
    const request = {
      request_id: 'r1',
      message: '帮我规划冰岛7天自驾',
    } as RouteAndRunRequestDto;
    const plan = convertToTripPlanRequest(request, {} as OrchestratorState);
    expect(plan.destination).toBe('冰岛');
    expect(plan.mode).toBe('drive');
    expect(plan.request_id).toBe('r1');
  });

  it('hydrateTripPlanRequestFromTripRecord no-ops without trip_id', async () => {
    const host: IntakeTripPlanRequestHost = {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
      prisma: {} as IntakeTripPlanRequestHost['prisma'],
    };
    const state = { metadata: {} } as OrchestratorState;
    const tripPlan = { destination: '未指定' } as TripPlanRequest;
    await hydrateTripPlanRequestFromTripRecord(
      host,
      { request_id: 'r1' } as RouteAndRunRequestDto,
      tripPlan,
      state,
    );
    expect((state.metadata as any).trip_hydration).toMatchObject({
      attempted: false,
      status: 'no_trip_id',
    });
    expect(tripPlan.destination).toBe('未指定');
  });
});
