import { enrichOrchestrationResultWithFullTripReplanHotel } from './full-trip-replan-hotel.runner';
import type { FullTripReplanHotelHost } from './full-trip-replan-hotel.host';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import type { OrchestrationResult } from '../interfaces/claude-orchestration.interface';

describe('full-trip-replan-hotel.runner', () => {
  it('returns original result when metadata is not full-trip replan', async () => {
    const host: FullTripReplanHotelHost = {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
      runLiveHotelSensorBranch: jest.fn(),
      persistRouteRunAccommodationsToClientSession: jest.fn(),
      attachHotelRouteRunUiToOrchestrationResult: jest.fn(),
    };
    const result = { success: true } as OrchestrationResult;
    const state = {
      request_id: 'r1',
      decision_log: [],
      metadata: {},
    } as unknown as OrchestratorState;
    const out = await enrichOrchestrationResultWithFullTripReplanHotel(
      host,
      { request_id: 'r1', message: '改行程' } as any,
      {} as any,
      state,
      result,
    );
    expect(out).toBe(result);
    expect(host.runLiveHotelSensorBranch).not.toHaveBeenCalled();
  });
});
