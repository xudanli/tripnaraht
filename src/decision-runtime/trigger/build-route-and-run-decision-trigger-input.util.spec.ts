import {
  buildRouteAndRunDecisionTriggerInput,
  buildRouteAndRunDecisionTriggerObservability,
} from './build-route-and-run-decision-trigger-input.util';
import type { RouteAndRunRequestDto } from '../../agent/dto/route-and-run.dto';

describe('buildRouteAndRunDecisionTriggerInput', () => {
  it('returns null without trip_id', () => {
    expect(
      buildRouteAndRunDecisionTriggerInput({
        request_id: 'r1',
        message: 'hi',
      } as RouteAndRunRequestDto),
    ).toBeNull();
  });

  it('maps replan intent to IN_TRIP_DEVIATION', () => {
    const input = buildRouteAndRunDecisionTriggerInput({
      request_id: 'r1',
      trip_id: 'trip-1',
      message: 'road closed',
      options: { intent_mode: 'IN_TRIP_REPLAN' as never },
    } as RouteAndRunRequestDto);
    expect(input?.kind).toBe('IN_TRIP_DEVIATION');
    expect(input?.source).toBe('AGENT_ROUTE_AND_RUN');
    expect(input?.metadata?.entryPointId).toBe('agent.route-and-run');
  });

  it('builds observability with agentic_hint_only note', () => {
    const triggerInput = buildRouteAndRunDecisionTriggerInput({
      request_id: 'r1',
      trip_id: 'trip-1',
      message: 'plan',
    } as RouteAndRunRequestDto)!;
    const obs = buildRouteAndRunDecisionTriggerObservability({ triggerInput });
    expect(obs.note).toBe('agentic_hint_only');
    expect(obs.trigger_input.tripId).toBe('trip-1');
  });
});
