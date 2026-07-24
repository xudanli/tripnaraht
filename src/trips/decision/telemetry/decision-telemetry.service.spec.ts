import { DecisionTelemetryService } from './decision-telemetry.service';
import type { DecisionTelemetryEvent } from './decision-telemetry.types';

describe('DecisionTelemetryService', () => {
  const baseEvent = (): DecisionTelemetryEvent => ({
    tripId: 'trip-1',
    userId: 'user-1',
    countryCode: 'IS',
    decisionPoint: 'ROUTE_SELECTION',
    context: {
      capturedAt: new Date().toISOString(),
      weather: { severity: 'high', condition: 'snow' },
      travelExperienceLevel: 'first_time',
      timePressure: 'medium',
    },
    decision: {
      optionId: 'guided-tour',
      action: 'ALLOW',
      selectedAt: new Date().toISOString(),
    },
    candidates: [
      {
        optionId: 'guided-tour',
        label: '跟团游',
        counterfactual: {
          projected_outcome: { satisfaction: 4.2, trip_friction_score: 0.2 },
          narrative_zh: '跟团降低驾驶焦虑',
        },
      },
      {
        optionId: 'self-drive',
        label: '自驾',
        rejected: true,
        rejectionReasonCodes: ['DRIVING_ANXIETY', 'WINTER_WEATHER'],
        characteristics: { transport_mode: 'self_drive' },
        counterfactual: {
          projected_outcome: { satisfaction: 2.8, trip_friction_score: 0.75 },
          utility_delta_vs_chosen: -0.35,
          narrative_zh: '冬季自驾摩擦显著更高',
        },
      },
    ],
    reasons: {
      reasonCodes: ['WINTER_WEATHER', 'DRIVING_ANXIETY'],
      userReasoning: '冬天不敢自驾',
    },
    source: 'user',
  });

  it('assessCompleteness scores intelligence dimensions', () => {
    const svc = new DecisionTelemetryService({ logDecision: jest.fn(), logOutcome: jest.fn() } as never);
    const c = svc.assessCompleteness(baseEvent());
    expect(c.hasDecision).toBe(true);
    expect(c.hasCandidates).toBe(true);
    expect(c.hasContext).toBe(true);
    expect(c.hasCounterfactuals).toBe(true);
    expect(c.intelligence_score).toBeGreaterThan(0.5);
  });

  it('record infers causality and persists metadata', async () => {
    const logDecision = jest.fn().mockResolvedValue({ id: 'dec-1' });
    const prisma = {
      decisionLog: {
        findUnique: jest.fn().mockResolvedValue({ metadata: {} }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const svc = new DecisionTelemetryService(
      { logDecision, logOutcome: jest.fn() } as never,
      prisma as never,
    );

    const result = await svc.record(baseEvent());
    expect(result.decisionLogId).toBe('dec-1');
    expect(result.causality_id).toBeTruthy();
    expect(result.intelligence_grade).not.toBe('logging');
    expect(prisma.decisionLog.update).toHaveBeenCalled();
  });

  it('rejects events with fewer than 2 candidates', async () => {
    const svc = new DecisionTelemetryService({ logDecision: jest.fn() } as never);
    const bad = { ...baseEvent(), candidates: [baseEvent().candidates[0]] };
    await expect(svc.record(bad)).rejects.toThrow(/at least 2 options/);
  });
});
