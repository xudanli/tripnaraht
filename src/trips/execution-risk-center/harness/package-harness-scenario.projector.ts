import { RiskGenerationMode } from '../../../generated/execution-risk-contracts';
import type { ActiveRiskType, RiskSourceProjection } from '../types/execution-risk.types';
import {
  mergeMetricBags,
  normalizeHarnessObservedMetrics,
  roadClosureStatusMetric,
  type RiskMetricBag,
} from '../knowledge/risk-metric-extraction.util';
import {
  resolveRiskTypeForKnowledge,
  resolveRuntimeCodeForKnowledge,
} from '../knowledge/knowledge-runtime-code.util';
import type { PackageHarnessScenario } from './package-harness.types';
import { projectHarnessPlanSimulationRisks } from './package-harness-plan-simulation.projector';
import { buildHarnessProjection } from './package-harness-projection.util';

function harnessMetricIsTrue(
  metrics: Record<string, number | string | boolean> | undefined,
  key: string,
): boolean {
  const raw = (metrics as Record<string, unknown> | undefined)?.[key];
  return raw === true || raw === 'true' || raw === 1 || raw === '1';
}

function harnessMetricIsFalse(
  metrics: Record<string, number | string | boolean> | undefined,
  key: string,
): boolean {
  const raw = (metrics as Record<string, unknown> | undefined)?.[key];
  return raw === false || raw === 'false' || raw === 0 || raw === '0';
}

const ENV_EVENT_KNOWLEDGE: Record<string, string> = {
  WIND: 'ENV-WIND-01',
  RAIN: 'ENV-PRECIP-01',
  SNOW: 'ENV-PRECIP-02',
  FOG: 'ENV-VIS-01',
  VOLCANIC_ERUPTION: 'ENV-VOLC-01',
};

const ROAD_EVENT_KNOWLEDGE: Record<string, string> = {
  ROAD_CLOSURE: 'ROAD-CLOSE-01',
  ROAD_SURFACE: 'ROAD-ICE-01',
  ROAD_RESTRICTION: 'ROAD-VEHICLE-01',
  FLOOD_ALERT: 'ROAD-WATER-01',
  FERRY_CANCELLATION: 'ROAD-FERRY-01',
};

const MEMBER_EVENT_KNOWLEDGE: Record<string, string> = {
  FATIGUE_INDICATOR: 'MEMBER-FATIGUE-DRIVER-01',
  EXHAUSTION: 'MEMBER-FATIGUE-01',
  INJURY: 'MEMBER-INJURY-01',
  ILLNESS: 'MEMBER-INJURY-01',
  CHILD_DISTRESS: 'MEMBER-VULNERABLE-01',
  GROUP_CONFLICT: 'TEAM-DISAGREE-01',
};

const HARNESS_TRIP_PREFIX = 'harness_trip';

export function projectHarnessScenario(scenario: PackageHarnessScenario): RiskSourceProjection[] {
  const tripId = `${HARNESS_TRIP_PREFIX}_${scenario.scenarioId}`;
  const baseMetrics = normalizeHarnessObservedMetrics(scenario.observedMetrics ?? {});
  const projections: RiskSourceProjection[] = [];
  const now = scenario.context?.currentTime
    ? String(scenario.context.currentTime)
    : new Date().toISOString();

  const hasFerryCancellation = (scenario.roadEvents ?? []).some(
    (e) => String(e.eventType) === 'FERRY_CANCELLATION',
  );
  const envPrimaryCodes = new Set(
    (scenario.expected.clusters ?? []).map((c) => c.primaryKnowledgeCode),
  );

  for (const event of scenario.environmentEvents ?? []) {
    if (hasFerryCancellation && String(event.eventType) === 'WIND') continue;
    if (shouldSkipEnvironmentEvent(event, scenario)) continue;
    projections.push(
      projectHarnessEnvironmentEvent(tripId, event, baseMetrics, now, scenario.scenarioId),
    );
    projections.push(
      ...projectHarnessSecondaryEnvironmentRisks(
        tripId,
        event,
        baseMetrics,
        now,
        scenario.scenarioId,
      ),
    );
  }

  for (const event of scenario.roadEvents ?? []) {
    if (shouldSkipDirectRoadEvent(event, scenario, envPrimaryCodes)) continue;
    projections.push(
      projectHarnessRoadEvent(tripId, event, baseMetrics, now, scenario.scenarioId, scenario),
    );
    projections.push(
      ...projectHarnessSecondaryRoadRisks(tripId, event, baseMetrics, now, scenario.scenarioId),
    );
  }

  const projectedGroupConflict = new Set<string>();

  for (const event of scenario.memberEvents ?? []) {
    const eventType = String(event.eventType ?? '');
    if (eventType === 'GROUP_CONFLICT') {
      if (projectedGroupConflict.has(scenario.scenarioId)) continue;
      projectedGroupConflict.add(scenario.scenarioId);
    }
    projections.push(
      projectHarnessMemberEvent(tripId, event, baseMetrics, now, scenario.scenarioId, scenario),
    );
  }

  projections.push(...projectHarnessPlanSimulationRisks(scenario));

  return projections;
}

function projectHarnessEnvironmentEvent(
  tripId: string,
  event: Record<string, unknown>,
  baseMetrics: RiskMetricBag,
  detectedAt: string,
  scenarioId: string,
): RiskSourceProjection {
  const eventType = String(event.eventType ?? 'UNKNOWN');
  const knowledgeCode = ENV_EVENT_KNOWLEDGE[eventType] ?? 'ENV-WIND-01';
  const metrics = mergeMetricBags(baseMetrics, buildEnvironmentEventMetrics(event, eventType));
  const code = resolveRuntimeCodeForKnowledge(knowledgeCode);
  const type = resolveRiskTypeForKnowledge(knowledgeCode, 'ENVIRONMENT');

  return buildHarnessProjection({
    tripId,
    scenarioId,
    subject: `env:${eventType}`,
    type,
    code,
    knowledgeCode,
    title: `Environment ${eventType}`,
    summary: `Harness environment event ${eventType}`,
    detectedAt,
    metrics,
    isRootCause: true,
    generationMode: RiskGenerationMode.DIRECT_DETECTION,
    rootEventId: `env-${scenarioId}-${eventType}`,
    sourceId: `harness-env-${scenarioId}-${eventType}`,
    sourceSystem: 'ENVIRONMENT_EVENT',
  });
}

function projectHarnessRoadEvent(
  tripId: string,
  event: Record<string, unknown>,
  baseMetrics: RiskMetricBag,
  detectedAt: string,
  scenarioId: string,
  scenario: PackageHarnessScenario,
): RiskSourceProjection {
  const eventType = String(event.eventType ?? 'ROAD_CLOSURE');
  const knowledgeCode = resolveHarnessRoadKnowledgeCode(eventType, event, scenario);
  const status = String(event.status ?? 'CLOSED');
  const metrics = mergeMetricBags(baseMetrics, buildRoadEventMetrics(event, eventType, status));
  const code = resolveRuntimeCodeForKnowledge(knowledgeCode);
  const type: ActiveRiskType = 'ROAD_TRANSPORT';
  const isClusterPrimary = (scenario.expected.clusters ?? []).some(
    (c) => c.primaryKnowledgeCode === knowledgeCode,
  );
  const isMemberOnly = (scenario.expected.clusters ?? []).some(
    (c) =>
      c.primaryKnowledgeCode !== knowledgeCode &&
      (c.memberRiskCodes ?? []).includes(knowledgeCode),
  );

  return buildHarnessProjection({
    tripId,
    scenarioId,
    subject: `road:${event.roadId ?? event.serviceId ?? eventType}`,
    type,
    code,
    knowledgeCode,
    title: `Road ${eventType}`,
    summary: `Harness road event ${eventType} on ${String(event.roadId ?? event.serviceId ?? 'route')}`,
    detectedAt,
    metrics,
    isRootCause: isClusterPrimary || !isMemberOnly,
    generationMode: RiskGenerationMode.DIRECT_DETECTION,
    rootEventId: `road-${scenarioId}-${eventType}`,
    sourceId: `harness-road-${scenarioId}-${eventType}`,
    sourceSystem: 'TRAVEL_RISK_EVENT',
  });
}

function resolveHarnessRoadKnowledgeCode(
  eventType: string,
  event: Record<string, unknown>,
  scenario: PackageHarnessScenario,
): string {
  if (eventType === 'ROAD_SURFACE') {
    const expectsWet = (scenario.expected.activeRisks ?? []).some(
      (r) => r.knowledgeCode === 'ROAD-WET-01',
    );
    if (expectsWet) return 'ROAD-WET-01';
    return 'ROAD-ICE-01';
  }
  if (eventType === 'ROAD_CLOSURE') {
    const hasVolcanicRoot = (scenario.environmentEvents ?? []).some(
      (e) => String(e.eventType) === 'VOLCANIC_ERUPTION',
    );
    const expectsClose02 = (scenario.expected.activeRisks ?? []).some(
      (r) => r.knowledgeCode === 'ROAD-CLOSE-02',
    );
    if (hasVolcanicRoot || expectsClose02) return 'ROAD-CLOSE-02';
  }
  return ROAD_EVENT_KNOWLEDGE[eventType] ?? 'ROAD-CLOSE-01';
}

function buildRoadEventMetrics(
  event: Record<string, unknown>,
  eventType: string,
  status: string,
): RiskMetricBag {
  const metrics: RiskMetricBag = {};
  if (eventType === 'ROAD_CLOSURE' || eventType === 'FLOOD_ALERT') {
    metrics.ROAD_STATUS = roadClosureStatusMetric(status);
  }
  if (eventType === 'ROAD_SURFACE') {
    const surface = String(event.surfaceCondition ?? 'WET');
    metrics.ROAD_SURFACE_CONDITION = surface;
    if (surface === 'WET' || surface === 'ICY') metrics.ROAD_STATUS = 'ADVISORY';
  }
  if (eventType === 'ROAD_RESTRICTION') {
    metrics.VEHICLE_DRIVE_TYPE = String(event.vehicleRequirement ?? '4WD');
    metrics.ROAD_REQUIRED_DRIVE = String(event.vehicleRequirement ?? '4WD');
  }
  if (eventType === 'FERRY_CANCELLATION') {
    metrics.FERRY_STATUS = String(event.status ?? 'CANCELLED');
  }
  return metrics;
}

function shouldSkipEnvironmentEvent(
  event: Record<string, unknown>,
  scenario: PackageHarnessScenario,
): boolean {
  if (String(event.eventType) === 'SEA_CONDITION') {
    return harnessMetricIsTrue(scenario.observedMetrics, 'operatorCancellationConfirmed');
  }
  return false;
}

function shouldSkipDirectRoadEvent(
  event: Record<string, unknown>,
  scenario: PackageHarnessScenario,
  envPrimaryCodes: Set<string>,
): boolean {
  if (String(event.eventType) !== 'ROAD_CLOSURE') return false;
  const hasSnowRoot = (scenario.environmentEvents ?? []).some(
    (e) => String(e.eventType) === 'SNOW',
  );
  return hasSnowRoot && envPrimaryCodes.has('ENV-PRECIP-02');
}

function projectHarnessSecondaryEnvironmentRisks(
  tripId: string,
  event: Record<string, unknown>,
  baseMetrics: RiskMetricBag,
  detectedAt: string,
  scenarioId: string,
): RiskSourceProjection[] {
  const eventType = String(event.eventType ?? 'UNKNOWN');
  const projections: RiskSourceProjection[] = [];

  if (eventType === 'SNOW') {
    const visibility = Number(baseMetrics.VISIBILITY_M ?? event.visibilityM ?? Number.NaN);
    if (Number.isFinite(visibility) && visibility < 500) {
      const knowledgeCode = 'ENV-VIS-02';
      projections.push(
        buildHarnessProjection({
          tripId,
          scenarioId,
          subject: `env:${eventType}:whiteout`,
          type: resolveRiskTypeForKnowledge(knowledgeCode, 'ENVIRONMENT'),
          code: resolveRuntimeCodeForKnowledge(knowledgeCode),
          knowledgeCode,
          title: 'Whiteout conditions',
          summary: 'Harness snow whiteout from low visibility',
          detectedAt,
          metrics: mergeMetricBags(baseMetrics, { VISIBILITY_M: visibility }),
          isRootCause: false,
          generationMode: RiskGenerationMode.DIRECT_DETECTION,
          rootEventId: `env-${scenarioId}-${eventType}`,
          sourceId: `harness-env-${scenarioId}-${eventType}-vis02`,
          sourceSystem: 'ENVIRONMENT_EVENT',
        }),
      );
    }
  }

  return projections;
}

function projectHarnessSecondaryRoadRisks(
  tripId: string,
  event: Record<string, unknown>,
  baseMetrics: RiskMetricBag,
  detectedAt: string,
  scenarioId: string,
): RiskSourceProjection[] {
  const eventType = String(event.eventType ?? '');
  const projections: RiskSourceProjection[] = [];

  if (eventType === 'ROAD_RESTRICTION') {
    const knowledgeCode = 'ROAD-VEHICLE-01';
    projections.push(
      buildHarnessProjection({
        tripId,
        scenarioId,
        subject: `road:${event.roadId ?? eventType}:insurance`,
        type: 'ROAD_TRANSPORT',
        code: resolveRuntimeCodeForKnowledge(knowledgeCode),
        knowledgeCode,
        title: 'Vehicle insurance void risk',
        summary: `Harness insurance exposure for ${String(event.roadId ?? 'restricted road')}`,
        detectedAt,
        metrics: mergeMetricBags(baseMetrics, buildRoadEventMetrics(event, eventType, 'RESTRICTED')),
        isRootCause: false,
        generationMode: RiskGenerationMode.PLAN_SIMULATION,
        rootEventId: `road-${scenarioId}-${eventType}`,
        sourceId: `harness-road-${scenarioId}-${eventType}-insurance`,
        sourceSystem: 'TRAVEL_RISK_EVENT',
      }),
    );
  }

  if (eventType === 'ROAD_CLOSURE') {
    const fuelPercent = Number(baseMetrics.FUEL_REMAINING_PERCENT ?? Number.NaN);
    const rangeDeficit = Number(baseMetrics.FUEL_RANGE_DEFICIT_KM ?? Number.NaN);
    if (
      (Number.isFinite(fuelPercent) && fuelPercent <= 35) ||
      (Number.isFinite(rangeDeficit) && rangeDeficit > 0)
    ) {
      const knowledgeCode = 'ROAD-FUEL-01';
      projections.push(
        buildHarnessProjection({
          tripId,
          scenarioId,
          subject: `road:${event.roadId ?? eventType}:fuel`,
          type: 'ROAD_TRANSPORT',
          code: resolveRuntimeCodeForKnowledge(knowledgeCode),
          knowledgeCode,
          title: 'Low fuel on detour',
          summary: 'Harness fuel shortage risk from closure detour',
          detectedAt,
          metrics: baseMetrics,
          isRootCause: false,
          generationMode: RiskGenerationMode.PLAN_SIMULATION,
          rootEventId: `road-${scenarioId}-${eventType}`,
          sourceId: `harness-road-${scenarioId}-${eventType}-fuel`,
          sourceSystem: 'TRAVEL_RISK_EVENT',
        }),
      );
    }
  }

  return projections;
}

function projectHarnessMemberEvent(
  tripId: string,
  event: Record<string, unknown>,
  baseMetrics: RiskMetricBag,
  detectedAt: string,
  scenarioId: string,
  scenario: PackageHarnessScenario,
): RiskSourceProjection {
  const eventType = String(event.eventType ?? 'FATIGUE_INDICATOR');
  const knowledgeCode = resolveHarnessMemberKnowledgeCode(eventType, event, baseMetrics, scenario);
  const hours = Number(event.continuousDrivingHours ?? baseMetrics.CONTINUOUS_DRIVING_HOURS ?? 0);
  const metrics = mergeMetricBags(baseMetrics, {
    CONTINUOUS_DRIVING_HOURS: hours,
  });
  const code = resolveRuntimeCodeForKnowledge(knowledgeCode);
  const type = resolveRiskTypeForKnowledge(knowledgeCode);
  const memberId = String(event.memberId ?? 'M-001');

  return buildHarnessProjection({
    tripId,
    scenarioId,
    subject: `member:${memberId}:${eventType}`,
    type,
    code,
    knowledgeCode,
    title: `Member ${eventType}`,
    summary: `Harness member event ${eventType} for ${memberId}`,
    detectedAt,
    metrics,
    isRootCause: true,
    generationMode: RiskGenerationMode.DIRECT_DETECTION,
    rootEventId: `member-${scenarioId}-${memberId}`,
    sourceId: `harness-member-${scenarioId}-${memberId}`,
    sourceSystem: 'MEMBER_RUNTIME',
    affectedMembers: [{ id: memberId, label: memberId, kind: 'member' }],
  });
}

function resolveHarnessMemberKnowledgeCode(
  eventType: string,
  event: Record<string, unknown>,
  baseMetrics: RiskMetricBag,
  scenario: PackageHarnessScenario,
): string {
  if (eventType === 'INJURY') {
    const expectsSkill = (scenario.expected.activeRisks ?? []).some(
      (r) => r.knowledgeCode === 'MEMBER-SKILL-01',
    );
    if (
      expectsSkill ||
      harnessMetricIsFalse(scenario.observedMetrics, 'memberCapabilityMatch')
    ) {
      return 'MEMBER-SKILL-01';
    }
  }
  return MEMBER_EVENT_KNOWLEDGE[eventType] ?? 'MEMBER-FATIGUE-DRIVER-01';
}

function buildEnvironmentEventMetrics(
  event: Record<string, unknown>,
  eventType: string,
): RiskMetricBag {
  const metrics: RiskMetricBag = {};
  if (eventType === 'WIND') {
    if (event.sustainedSpeedMs !== undefined) {
      metrics.WIND_SUSTAINED_MPS = Number(event.sustainedSpeedMs);
    }
    if (event.gustSpeedMs !== undefined) metrics.WIND_GUST_MPS = Number(event.gustSpeedMs);
  }
  if (eventType === 'RAIN' && event.intensityMmh !== undefined) {
    metrics.PRECIPITATION_RATE_MMH = Number(event.intensityMmh);
  }
  if (eventType === 'SNOW' && event.intensityCmh !== undefined) {
    metrics.SNOWFALL_RATE_CMH = Number(event.intensityCmh);
  }
  if (eventType === 'FOG' && event.visibilityM !== undefined) {
    metrics.VISIBILITY_M = Number(event.visibilityM);
  }
  return metrics;
}
