import { maybeAutoApplyItineraryAdjustCorridor } from './itinerary-adjust-auto-apply.runner';
import type { ItineraryAdjustAutoApplyHost } from './itinerary-adjust-auto-apply.host';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';

describe('itinerary-adjust-auto-apply.runner', () => {
  function makeHost(
    overrides: Partial<ItineraryAdjustAutoApplyHost> = {},
  ): ItineraryAdjustAutoApplyHost {
    return {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
      resolvePlaceIdForItineraryAdjustApply: jest.fn(() => undefined),
      ...overrides,
    };
  }

  it('maybeAutoApplyItineraryAdjustCorridor no-ops when intent is not ITINERARY_ADJUST', async () => {
    const host = makeHost();
    const state = {
      request_id: 'r1',
      metadata: { route_and_run_intent: { primary: 'NEW_TRIP' } },
      itinerary: { days: [{ date: '2026-08-01', items: [] }] },
      decision_log: [],
    } as unknown as OrchestratorState;

    await maybeAutoApplyItineraryAdjustCorridor(host, state);

    expect(state.metadata.itinerary_adjust_auto_apply).toBeUndefined();
    expect(host.logger.warn).not.toHaveBeenCalled();
  });

  it('maybeAutoApplyItineraryAdjustCorridor no-ops when clarification pending', async () => {
    const host = makeHost();
    const state = {
      request_id: 'r1',
      metadata: { route_and_run_intent: { primary: 'ITINERARY_ADJUST' } },
      clarification_questions: ['缺目的地？'],
      itinerary: { days: [{ date: '2026-08-01', items: [{}] }] },
      decision_log: [],
    } as unknown as OrchestratorState;

    await maybeAutoApplyItineraryAdjustCorridor(host, state);

    expect(state.metadata.itinerary_adjust_auto_apply).toBeUndefined();
  });
});
