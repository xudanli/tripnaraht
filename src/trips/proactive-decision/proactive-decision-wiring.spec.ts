import {
  normalizeRoadStatusToProactiveSignal,
  normalizeWeatherHazardToProactiveSignal,
} from './signals/normalize-proactive-world-signal.util';
import { buildWeatherHazardChangedEvent } from '../guardian-decision-core/evidence/weather-hazard-changed.event';
import { buildRoadStatusChangedEvent } from '../guardian-decision-core/evidence/road-status-changed.event';
import {
  runProactiveDecisionIntakeFromRoad,
  runProactiveDecisionIntakeFromWeather,
} from './orchestration/run-proactive-decision-intake.util';
import {
  buildProactiveRfc001Problem,
  openProactiveDecisionProblem,
  type ProactiveProblemStorePort,
} from './writers/open-proactive-decision-problem.util';
import { buildProactiveCanonicalEvaluateTriggerInput } from './orchestration/build-proactive-evaluate-trigger.util';
import type { Rfc001DecisionProblem } from '../guardian-decision-core/contracts/decision-problem.types';
import { isProactiveDecisionV1Enabled } from './config/proactive-decision-feature-flags.util';

describe('Proactive Decision V1 — PD-1/PD-3 wiring', () => {
  const weatherImpact = (ids: string[]) => ({
    affectedPlanItemIds: ids,
    affectedEntityRefs: ids.map((id) => ({
      kind: 'PLAN_ITEM' as const,
      id,
    })),
  });

  function memoryStore(
    seed: Rfc001DecisionProblem[] = [],
  ): ProactiveProblemStorePort & { items: Rfc001DecisionProblem[] } {
    const items = [...seed];
    return {
      items,
      async findOpenByTriggerEvent(tripId, triggerEventId) {
        return items.find(
          (p) =>
            p.tripId === tripId &&
            p.triggerEventId === triggerEventId &&
            !['RESOLVED', 'FAILED'].includes(p.status),
        );
      },
      async upsert(tripId, problem) {
        const idx = items.findIndex((p) => p.problemId === problem.problemId);
        if (idx >= 0) items[idx] = problem;
        else items.push(problem);
        expect(problem.tripId).toBe(tripId);
        return problem;
      },
    };
  }

  it('normalizes weather hazard → WEATHER_WIND signal', () => {
    const event = buildWeatherHazardChangedEvent({
      tripId: 'trip_pd_w',
      windSpeedKmh: 100,
      regionId: 'Vik',
      occurredAt: '2026-08-11T10:00:00.000Z',
    });
    event.eventId = 'evt_weather_fixed';
    const normalized = normalizeWeatherHazardToProactiveSignal(event);
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;
    expect(normalized.signal.signalKind).toBe('WEATHER_WIND');
    expect(normalized.signal.signalEventId).toBe('evt_weather_fixed');
  });

  it('ignores OPEN road with no prior status (not allowlisted change)', () => {
    const event = buildRoadStatusChangedEvent({
      tripId: 'trip_pd_r',
      roadId: 'F208',
      status: 'OPEN',
      sourceProvider: 'admin_injection',
    });
    const normalized = normalizeRoadStatusToProactiveSignal(event);
    expect(normalized.ok).toBe(false);
  });

  it('intake is silent when feature flag off', () => {
    const event = buildWeatherHazardChangedEvent({
      tripId: 'trip_flag',
      windSpeedKmh: 110,
    });
    event.eventId = 'evt_flag';
    const normalized = normalizeWeatherHazardToProactiveSignal(event);
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;

    const intake = runProactiveDecisionIntakeFromWeather({
      signal: normalized.signal,
      weatherImpact: weatherImpact(['item_reynisfjara']),
      enabled: false,
    });
    expect(intake.status).toBe('SILENT');
    if (intake.status === 'SILENT') {
      expect(intake.reason).toBe('FEATURE_FLAG_OFF');
    }
  });

  it('opens RFC001 problem with CASE_CONTINUE_ACTIVITY and evaluate trigger', async () => {
    const event = buildWeatherHazardChangedEvent({
      tripId: 'trip_open',
      windSpeedKmh: 100,
      regionId: 'Reynisfjara',
    });
    event.eventId = 'evt_open_1';
    const normalized = normalizeWeatherHazardToProactiveSignal(event);
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;

    const intake = runProactiveDecisionIntakeFromWeather({
      signal: normalized.signal,
      weatherImpact: weatherImpact(['item_reynisfjara']),
      affectedItemLabels: ['Day4 Reynisfjara'],
      enabled: true,
    });
    expect(intake.status).toBe('CONTINUE');
    if (intake.status !== 'CONTINUE') return;

    const store = memoryStore();
    const opened = await openProactiveDecisionProblem(store, {
      impact: intake.impact,
      planVersionId: 'plan_1',
      worldStateSnapshotId: 'snap_1',
      affectedEntityRefs: weatherImpact(['item_reynisfjara']).affectedEntityRefs,
      idempotencyKey: intake.idempotencyKey,
      now: '2026-08-11T12:00:00.000Z',
    });

    expect(opened.opened).toBe(true);
    if (!opened.opened) return;
    expect(opened.reusedExisting).toBe(false);
    expect(opened.problem.proactiveCaseId).toBe('CASE_CONTINUE_ACTIVITY');
    expect(opened.problem.semanticCapability).toBe('WEATHER_ACTIVITY_PROHIBITED');
    expect(opened.problem.triggerEventId).toBe('evt_open_1');
    expect(store.items).toHaveLength(1);

    const trigger = buildProactiveCanonicalEvaluateTriggerInput({
      tripId: 'trip_open',
      problemId: opened.problem.problemId,
      signalEventId: 'evt_open_1',
      caseId: 'CASE_CONTINUE_ACTIVITY',
      idempotencyKey: intake.idempotencyKey,
      semanticCapability: opened.problem.semanticCapability,
    });
    expect(trigger.kind).toBe('CANONICAL_PROBLEM_EVALUATE');
    expect(trigger.metadata?.triggerProductKind).toBe('PROACTIVE_WORLD_SIGNAL');
    expect(trigger.problemId).toBe(opened.problem.problemId);
  });

  it('reuses existing problem by triggerEventId and stamps PD fields', async () => {
    const existing: Rfc001DecisionProblem = {
      problemId: 'problem_existing',
      tripId: 'trip_reuse',
      planVersionId: 'plan_1',
      type: 'FEASIBILITY_FAILURE',
      triggerEventId: 'evt_reuse',
      affectedEntityRefs: [],
      affectedPlanItemIds: ['item_a'],
      worldStateSnapshotId: 'snap_1',
      detectedAt: '2026-08-11T11:00:00.000Z',
      urgency: 'HIGH',
      status: 'OPEN',
      semanticCapability: 'WEATHER_ACTIVITY_PROHIBITED',
    };
    const store = memoryStore([existing]);

    const event = buildWeatherHazardChangedEvent({
      tripId: 'trip_reuse',
      windSpeedKmh: 95,
    });
    event.eventId = 'evt_reuse';
    const normalized = normalizeWeatherHazardToProactiveSignal(event);
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;

    const intake = runProactiveDecisionIntakeFromWeather({
      signal: normalized.signal,
      weatherImpact: weatherImpact(['item_a']),
      enabled: true,
    });
    expect(intake.status).toBe('CONTINUE');
    if (intake.status !== 'CONTINUE') return;

    const opened = await openProactiveDecisionProblem(store, {
      impact: intake.impact,
      planVersionId: 'plan_1',
      worldStateSnapshotId: 'snap_1',
      idempotencyKey: intake.idempotencyKey,
    });
    expect(opened.opened).toBe(true);
    if (!opened.opened) return;
    expect(opened.reusedExisting).toBe(true);
    expect(opened.problem.problemId).toBe('problem_existing');
    expect(opened.problem.proactiveCaseId).toBe('CASE_CONTINUE_ACTIVITY');
    expect(store.items).toHaveLength(1);
  });

  it('maps LIMITED road → CASE_REROUTE problem', async () => {
    const event = buildRoadStatusChangedEvent({
      tripId: 'trip_road',
      roadId: 'F208',
      status: 'LIMITED',
      previousStatus: 'OPEN',
      sourceProvider: 'admin_injection',
    });
    event.eventId = 'evt_road_lim';
    const normalized = normalizeRoadStatusToProactiveSignal(event);
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;
    expect(normalized.signal.signalKind).toBe('ROAD_DIFFICULTY_CHANGE');

    const intake = runProactiveDecisionIntakeFromRoad({
      signal: normalized.signal,
      roadImpact: {
        roadId: 'F208',
        affectedPlanItemIds: ['item_froad'],
      },
      enabled: true,
    });
    expect(intake.status).toBe('CONTINUE');
    if (intake.status !== 'CONTINUE') return;

    const problem = buildProactiveRfc001Problem({
      impact: intake.impact,
      planVersionId: 'plan_r',
      worldStateSnapshotId: 'snap_r',
      idempotencyKey: intake.idempotencyKey,
    });
    expect(problem.proactiveCaseId).toBe('CASE_REROUTE');
    expect(problem.semanticCapability).toBe('ROAD_SEGMENT_UNAVAILABLE');
  });

  it('feature flag defaults off', () => {
    expect(isProactiveDecisionV1Enabled({})).toBe(false);
    expect(isProactiveDecisionV1Enabled({ PROACTIVE_DECISION_V1_ENABLED: '1' })).toBe(
      true,
    );
  });
});
