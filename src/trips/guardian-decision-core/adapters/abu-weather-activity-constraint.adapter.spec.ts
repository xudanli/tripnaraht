import { evaluateAbuWeatherActivityConstraintForCandidate } from './abu-weather-activity-constraint.adapter';
import { weatherHazardChangedToAssertion } from './weather-hazard-to-assertion.adapter';
import { buildWeatherHazardChangedEvent } from '../evidence/weather-hazard-changed.event';
import { buildEvidenceRefForWeather } from './weather-hazard-to-assertion.adapter';
import type { RoutePlanDraft } from '../../decision/shared/world-model.types';
import { RFC001_REASON_CODES } from '../reason-codes/reason-code.registry';

function weatherAssertion(tripId: string, windSpeedKmh: number) {
  const event = buildWeatherHazardChangedEvent({
    tripId,
    windSpeedKmh,
    dayIndex: 2,
  });
  const observedAt = event.occurredAt;
  return weatherHazardChangedToAssertion({
    tripId,
    payload: event.payload,
    evidenceRef: buildEvidenceRefForWeather(tripId, 'IS_DEFAULT', observedAt),
    observedAt,
    confidence: 0.9,
  });
}

function outdoorPlan(): RoutePlanDraft {
  return {
    tripId: 'trip_wx_abu',
    segments: [
      {
        segmentId: 'seg_1',
        dayIndex: 2,
        metadata: {
          itineraryItemId: 'item_glacier',
          exposure: 'outdoor',
        },
      },
    ],
  };
}

function indoorPlan(): RoutePlanDraft {
  return {
    tripId: 'trip_wx_abu',
    segments: [
      {
        segmentId: 'seg_1',
        dayIndex: 2,
        metadata: {
          itineraryItemId: 'item_glacier',
          exposure: 'indoor',
        },
      },
    ],
  };
}

describe('abu-weather-activity-constraint.adapter', () => {
  const prev = process.env.DECISION_PACK_RULES;
  const prevRuntime = process.env.DECISION_PACK_RUNTIME;

  beforeEach(() => {
    process.env.DECISION_PACK_RULES = '1';
    process.env.DECISION_PACK_RUNTIME = '1';
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.DECISION_PACK_RULES;
    else process.env.DECISION_PACK_RULES = prev;
    if (prevRuntime === undefined) delete process.env.DECISION_PACK_RUNTIME;
    else process.env.DECISION_PACK_RUNTIME = prevRuntime;
  });

  it('WX-ABU-001: high wind + outdoor → BLOCK', () => {
    const result = evaluateAbuWeatherActivityConstraintForCandidate({
      tripId: 'trip_wx_abu',
      workspaceId: 'ws_1',
      targetCandidateId: 'original',
      weatherAssertion: weatherAssertion('trip_wx_abu', 95),
      affectedPlanItemIds: ['item_glacier'],
      candidatePlan: outdoorPlan(),
      destinationCountry: 'IS',
    });
    expect(result.verdict).toBe('BLOCK');
    expect(result.reasonCodes).toContain('WEATHER_HIGH_WIND');
  });

  it('WX-ABU-002: high wind + indoor candidate → PASS', () => {
    const result = evaluateAbuWeatherActivityConstraintForCandidate({
      tripId: 'trip_wx_abu',
      workspaceId: 'ws_1',
      targetCandidateId: 'cand_indoor',
      weatherAssertion: weatherAssertion('trip_wx_abu', 95),
      affectedPlanItemIds: ['item_glacier'],
      candidatePlan: indoorPlan(),
      destinationCountry: 'IS',
    });
    expect(result.verdict).toBe('PASS');
    expect(result.constraintCode).toBe('WEATHER_INDOOR_ALTERNATIVE');
  });

  it('WX-ABU-003: calm wind → PASS', () => {
    const result = evaluateAbuWeatherActivityConstraintForCandidate({
      tripId: 'trip_wx_abu',
      workspaceId: 'ws_1',
      targetCandidateId: 'original',
      weatherAssertion: weatherAssertion('trip_wx_abu', 40),
      affectedPlanItemIds: ['item_glacier'],
      candidatePlan: outdoorPlan(),
      destinationCountry: 'IS',
    });
    expect(result.verdict).toBe('PASS');
    expect(result.reasonCodes).not.toContain(RFC001_REASON_CODES.WEATHER_HIGH_WIND);
  });

  it('WX-ABU-004: outdoor load multiplier blocks sub-threshold raw wind', () => {
    const result = evaluateAbuWeatherActivityConstraintForCandidate({
      tripId: 'trip_wx_abu',
      workspaceId: 'ws_1',
      targetCandidateId: 'original',
      weatherAssertion: weatherAssertion('trip_wx_abu', 80),
      affectedPlanItemIds: ['item_glacier'],
      candidatePlan: outdoorPlan(),
      destinationCountry: 'IS',
    });
    expect(result.verdict).toBe('BLOCK');
    expect(result.reasonCodes).toContain('WEATHER_HIGH_WIND');
  });
});
