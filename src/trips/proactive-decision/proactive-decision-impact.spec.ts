import {
  assertProactiveImpactInvariants,
  toProactiveImpactWireJson,
} from './contracts/proactive-impact.types';
import { mapProactiveDecisionCase } from './mappers/proactive-case.mapper';
import {
  buildProactiveImpactFromRoad,
  buildProactiveImpactFromWeather,
} from './adapters/build-proactive-impact.util';
import {
  buildProactiveIdempotencyKey,
  shouldOpenDecisionProblem,
} from './orchestration/proactive-decision-orchestrator.types';
import type { WeatherActivityImpactResult } from '../guardian-decision-core/detection/weather-activity-impact-analyzer';

describe('Proactive Decision V1 — Impact DTO + Case Mapper (PD-2)', () => {
  const weatherImpact = (
    ids: string[],
  ): WeatherActivityImpactResult => ({
    affectedPlanItemIds: ids,
    affectedEntityRefs: ids.map((id) => ({
      kind: 'PLAN_ITEM' as const,
      id,
      label: id,
    })),
  });

  it('maps Reynisfjara wind → CASE_CONTINUE_ACTIVITY (RFC appendix shape)', () => {
    const impact = buildProactiveImpactFromWeather({
      tripId: 'trip_is_day4',
      signalEventId: 'evt_wind_001',
      signalKind: 'WEATHER_WIND',
      weatherImpact: weatherImpact(['item_reynisfjara']),
      affectedItemLabels: ['Day4 Reynisfjara'],
      createdAt: '2026-08-11T08:00:00.000Z',
    });

    expect(impact.decisionRequired).toBe(true);
    expect(impact.caseId).toBe('CASE_CONTINUE_ACTIVITY');
    expect(impact.impactLevel).toBe('HIGH');
    expect(impact.affectedItems).toEqual(['item_reynisfjara']);

    const wire = toProactiveImpactWireJson(impact);
    expect(wire).toEqual({
      impact_level: 'HIGH',
      affected_items: ['item_reynisfjara'],
      decision_required: true,
      case_id: 'CASE_CONTINUE_ACTIVITY',
      trip_id: 'trip_is_day4',
      signal_kind: 'WEATHER_WIND',
      signal_event_id: 'evt_wind_001',
      schema_id: 'nara.proactive_impact@v1',
    });

    expect(shouldOpenDecisionProblem(impact)).toBe(true);
    expect(
      buildProactiveIdempotencyKey({
        tripId: impact.tripId,
        signalEventId: impact.signalEventId,
        caseId: impact.caseId,
      }),
    ).toBe('pd_v1:trip_is_day4:evt_wind_001:CASE_CONTINUE_ACTIVITY');
  });

  it('maps road difficulty → CASE_REROUTE', () => {
    const impact = buildProactiveImpactFromRoad({
      tripId: 'trip_is_highland',
      signalEventId: 'evt_road_f208',
      signalKind: 'ROAD_DIFFICULTY_CHANGE',
      roadImpact: {
        roadId: 'F208',
        affectedPlanItemIds: ['item_froad_leg'],
      },
    });

    expect(impact.caseId).toBe('CASE_REROUTE');
    expect(impact.decisionRequired).toBe(true);
    assertProactiveImpactInvariants(impact);
  });

  it('maps closed weather window → CASE_POSTPONE_ACTIVITY', () => {
    const impact = buildProactiveImpactFromWeather({
      tripId: 'trip_is_glacier',
      signalEventId: 'evt_window_close',
      signalKind: 'WEATHER_BLIZZARD',
      weatherImpact: weatherImpact(['item_glacier_hike']),
      activityWindowClosed: true,
    });

    expect(impact.caseId).toBe('CASE_POSTPONE_ACTIVITY');
    expect(impact.impactLevel).toBe('CRITICAL');
  });

  it('short-circuits when no affected items (Silent)', () => {
    const mapped = mapProactiveDecisionCase({
      signalKind: 'WEATHER_WIND',
      affectedItems: [],
    });
    expect(mapped.decisionRequired).toBe(false);
    expect(mapped.caseId).toBeNull();

    const impact = buildProactiveImpactFromWeather({
      tripId: 'trip_quiet',
      signalEventId: 'evt_noise',
      signalKind: 'WEATHER_WIND',
      weatherImpact: weatherImpact([]),
    });
    expect(impact.decisionRequired).toBe(false);
    expect(shouldOpenDecisionProblem(impact)).toBe(false);
  });

  it('short-circuits LOW impact as noise', () => {
    const impact = buildProactiveImpactFromWeather({
      tripId: 'trip_soft',
      signalEventId: 'evt_soft',
      signalKind: 'WEATHER_HEAVY_RAIN',
      weatherImpact: weatherImpact(['item_beach']),
      impactLevel: 'LOW',
    });
    expect(impact.decisionRequired).toBe(false);
    expect(impact.caseId).toBeNull();
  });

  it('rejects decisionRequired without caseId via invariant', () => {
    expect(() =>
      assertProactiveImpactInvariants({
        schemaId: 'nara.proactive_impact@v1',
        version: 1,
        tripId: 't',
        signalKind: 'WEATHER_WIND',
        signalEventId: 'e',
        impactLevel: 'HIGH',
        affectedItems: ['a'],
        decisionRequired: true,
        caseId: null,
        countryCode: 'IS',
        createdAt: '2026-08-11T00:00:00.000Z',
      }),
    ).toThrow(/decision_required_without_case_id/);
  });
});
