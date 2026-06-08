import { buildIntakeClarificationTelemetryEvent } from './intake-decision-telemetry.util';
import type { OrchestratorState } from '../../../interfaces/trip-plan.interface';

describe('intake-decision-telemetry.util', () => {
  const state = { request_id: 'req-1', decision_log: [] } as OrchestratorState;

  it('builds intelligence-grade froad clarification event', () => {
    const event = buildIntakeClarificationTelemetryEvent({
      request: { trip_id: 'trip-1', user_id: 'user-1', message: '首次冰岛 F208 两驱' } as any,
      state,
      questionId: 'froad_2wd_compliance_v1',
      chosenOptionIds: ['SWITCH_GUIDE_MODE'],
      tripPlanRequest: {
        trip_id: 'trip-1',
        ontology_context: { destination: { country_code: 'IS' } },
        date_range: { start_date: '2026-06-15', end_date: '2026-06-20' },
      } as any,
    });

    expect(event).not.toBeNull();
    expect(event!.candidates.length).toBeGreaterThanOrEqual(2);
    expect(event!.context.travelExperienceLevel).toBe('first_time');
    expect(event!.reasons.reasonCodes).toContain('DRIVING_ANXIETY');
    const guided = event!.candidates.find((c) => c.optionId === 'SWITCH_GUIDE_MODE');
    expect(guided?.counterfactual?.narrative_zh).toContain('向导');
    const alt = event!.candidates.find((c) => c.optionId === 'ACCEPT_NEPTUNE_DETOUR');
    expect(alt?.counterfactual?.projected_outcome?.trip_friction_score).toBeGreaterThan(0);
  });

  it('returns null without trip_id', () => {
    const event = buildIntakeClarificationTelemetryEvent({
      request: { message: 'test' } as any,
      state,
      questionId: 'froad_2wd_compliance_v1',
      chosenOptionIds: ['UPGRADE_VEHICLE_TO_4WD'],
    });
    expect(event).toBeNull();
  });
});
