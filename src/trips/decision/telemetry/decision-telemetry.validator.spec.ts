import { inferCausalStructure, validateTelemetryEvent } from './decision-telemetry.validator';
import type { DecisionTelemetryEvent } from './decision-telemetry.types';

const sampleEvent = (): DecisionTelemetryEvent => ({
  tripId: 't1',
  countryCode: 'IS',
  decisionPoint: 'ROUTE_SELECTION',
  context: {
    capturedAt: new Date().toISOString(),
    weather: { severity: 'high' },
    travelExperienceLevel: 'first_time',
  },
  decision: { optionId: 'guided', action: 'ALLOW', selectedAt: new Date().toISOString() },
  candidates: [
    { optionId: 'guided', label: '跟团', counterfactual: { projected_outcome: {} } },
    { optionId: 'self-drive', label: '自驾', counterfactual: { projected_outcome: {} } },
  ],
  reasons: { reasonCodes: ['WINTER_WEATHER', 'DRIVING_ANXIETY'] },
  source: 'user',
});

describe('decision-telemetry.validator', () => {
  it('infers driving_anxiety with counterfactual delta', () => {
    const causality = inferCausalStructure(sampleEvent());
    const anxiety = causality.active_factors.find((f) => f.factor_id === 'driving_anxiety');
    expect(anxiety?.weight).toBeCloseTo(0.62);
    expect(anxiety?.counterfactual_delta_if_absent).toBe(-0.37);
  });

  it('validates minimum candidate count', () => {
    const v = validateTelemetryEvent(sampleEvent());
    expect(v.valid).toBe(true);
    expect(v.intelligence_grade).not.toBe('logging');
  });
});
