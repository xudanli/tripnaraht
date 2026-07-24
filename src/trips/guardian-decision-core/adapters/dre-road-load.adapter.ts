/**
 * WP2 — deterministic Dr.Dre road-load assessment for Iceland RFC-001 evaluate path.
 * Computes driving hours, day stress, and duration delta vs baseline (no plan mutation).
 */

import type { RoutePlanDraft, RouteSegment } from '../../decision/shared/world-model.types';
import type { WorldModelContext } from '../../decision/shared/world-model.types';
import type { DecisionResult } from '../../decision/shared/decision-result.types';
import type { Rfc001LoadAssessment } from '../contracts/guardian-outputs.types';
import type { Rfc001RepairCandidate } from '../contracts/guardian-outputs.types';
import { DrivingSafetyConcernService } from '../../decision/services/driving-safety-concern.service';
import {
  DRIVING_ESTIMATION_CONFIG,
  DRIVING_SAFETY_CONFIG,
  ROAD_FATIGUE_FACTOR_MAP,
} from '../../decision/optimization/learning/guardian-persona.interface';
import { mapDreResultToAssessment } from './load-assessment.adapter';
import { resolveActivityLoadEnvironmentForCountry } from '../../../decision-runtime/packs/modifiers/pack-modifier-bundle.loader';
import { applyHighlandFatigueToPhysicalLoad } from '../../../decision-runtime/packs/modifiers/apply-outdoor-load-modifiers.util';

export const DRDRE_ROAD_MODEL_VERSION = 'dre-road-load-rfc001-0.2.0';

const drivingConcernService = new DrivingSafetyConcernService();

export interface DreRoadLoadInput {
  workspaceId: string;
  targetCandidateId: string;
  inputSnapshotRef: string;
  baselinePlan: RoutePlanDraft;
  candidatePlan: RoutePlanDraft;
  repairCandidate?: Rfc001RepairCandidate;
  world?: WorldModelContext;
  affectedTravelerIds?: string[];
  /** Day index receiving repair duration delta (defaults to max-driving day) */
  affectedDayIndex?: number;
  /** Country for pack outdoor-load modifiers (highland fatigue) */
  destinationCountry?: string;
}

export interface DreRoadLoadMetrics {
  maxDayDrivingHours: number;
  baselineMaxDayDrivingHours: number;
  addedDurationMinutes: number;
  drivingHoursByDay: Map<number, number>;
}

function resolveDrivingSpeedKmH(world?: WorldModelContext): number {
  const meta = (world?.routeDirection as { metadata?: Record<string, unknown> })?.metadata;
  if (!meta) return DRIVING_ESTIMATION_CONFIG.defaultSpeedKmH;
  const roadType =
    (meta.route_basic_info as { road_type?: string })?.road_type ??
    (meta as { roadType?: string }).roadType ??
    '';
  const lower = String(roadType).toLowerCase();
  for (const [keyword, speed] of Object.entries(
    DRIVING_ESTIMATION_CONFIG.roadTypeSpeedMap,
  )) {
    if (lower.includes(keyword)) return speed;
  }
  return DRIVING_ESTIMATION_CONFIG.defaultSpeedKmH;
}

function segmentDrivingHours(segment: RouteSegment, speedKmH: number): number {
  const meta = segment.metadata as Record<string, unknown> | undefined;
  const durationMin = meta?.travelFromPreviousDurationMin;
  if (typeof durationMin === 'number' && durationMin > 0) {
    return durationMin / 60;
  }
  const distanceKm = Number(segment.distanceKm) || 0;
  if (distanceKm > 0) return distanceKm / speedKmH;
  return 0;
}

export function computeDrivingHoursByDay(
  plan: RoutePlanDraft,
  speedKmH: number,
): Map<number, number> {
  const byDay = new Map<number, number>();
  for (const seg of plan.segments ?? []) {
    const day = seg.dayIndex ?? 0;
    byDay.set(day, (byDay.get(day) ?? 0) + segmentDrivingHours(seg, speedKmH));
  }
  return byDay;
}

function maxMapValue(map: Map<number, number>): number {
  let max = 0;
  for (const v of map.values()) max = Math.max(max, v);
  return max;
}

function resolveEffectiveSafeHours(world?: WorldModelContext): number {
  const base = DRIVING_SAFETY_CONFIG.baseSafeHours;
  const meta = (world?.routeDirection as { metadata?: Record<string, unknown> })?.metadata;
  const roadType =
    (meta?.route_basic_info as { road_type?: string })?.road_type ??
    (meta as { roadType?: string })?.roadType ??
    'gravel';
  const lower = String(roadType).toLowerCase();
  let roadFactor = 1.0;
  for (const [keyword, factor] of Object.entries(ROAD_FATIGUE_FACTOR_MAP)) {
    if (lower.includes(keyword)) {
      roadFactor = factor;
      break;
    }
  }
  return base * roadFactor;
}

export function computeDreRoadLoadMetrics(
  input: Pick<
    DreRoadLoadInput,
    'baselinePlan' | 'candidatePlan' | 'repairCandidate' | 'world' | 'affectedDayIndex'
  >,
): DreRoadLoadMetrics {
  const speedKmH = resolveDrivingSpeedKmH(input.world);
  const baselineByDay = computeDrivingHoursByDay(input.baselinePlan, speedKmH);
  const candidateByDay = new Map(
    computeDrivingHoursByDay(input.candidatePlan, speedKmH),
  );

  const addedMinutes = input.repairCandidate?.estimatedAddedDurationMinutes ?? 0;
  if (addedMinutes !== 0) {
    const dayKeys = [...candidateByDay.keys()];
    const targetDay =
      input.affectedDayIndex ??
      (dayKeys.length > 0
        ? dayKeys.reduce((a, b) =>
            (candidateByDay.get(a) ?? 0) >= (candidateByDay.get(b) ?? 0) ? a : b,
          )
        : 0);
    candidateByDay.set(
      targetDay,
      (candidateByDay.get(targetDay) ?? 0) + addedMinutes / 60,
    );
  }

  return {
    maxDayDrivingHours: maxMapValue(candidateByDay),
    baselineMaxDayDrivingHours: maxMapValue(baselineByDay),
    addedDurationMinutes: addedMinutes,
    drivingHoursByDay: candidateByDay,
  };
}

function concernsToAdjustments(
  concerns: ReturnType<DrivingSafetyConcernService['detectConcerns']>,
): Rfc001LoadAssessment['adjustmentRequirements'] {
  return concerns.map((c) => ({
    code: `DRIVING_${c.severity}`,
    description: c.message,
  }));
}

export function evaluateDreRoadLoadForCandidate(
  input: DreRoadLoadInput,
): Rfc001LoadAssessment {
  const metrics = computeDreRoadLoadMetrics(input);
  const world = input.world;
  const safeHours = resolveEffectiveSafeHours(world);
  const warningHours = safeHours * DRIVING_SAFETY_CONFIG.warningRatio;

  const physicalLoad = applyHighlandFatigueToPhysicalLoad(
    Math.min(1, metrics.maxDayDrivingHours / safeHours),
    resolveActivityLoadEnvironmentForCountry(input.destinationCountry)
      .highlandFatigueFactor,
  );
  const deltaHours = Math.max(
    0,
    metrics.maxDayDrivingHours - metrics.baselineMaxDayDrivingHours,
  );
  const scheduleStress = Math.min(
    1,
    physicalLoad * 0.65 + Math.min(1, deltaHours / 4) * 0.35,
  );
  const recoveryDeficit =
    metrics.maxDayDrivingHours >= safeHours * DRIVING_SAFETY_CONFIG.dangerRatio
      ? 0.55
      : metrics.maxDayDrivingHours >= warningHours
        ? 0.35
        : 0.15;

  const concerns = drivingConcernService.detectConcerns(
    input.candidatePlan,
    world ?? { physical: { month: 2 }, human: {}, routeDirection: {} } as WorldModelContext,
  );

  let confidence = 0.88;
  if (metrics.maxDayDrivingHours === 0) confidence *= 0.75;

  return {
    assessmentId: `dre_road_${input.workspaceId}_${input.targetCandidateId}_${Date.now()}`,
    workspaceId: input.workspaceId,
    actor: 'DRDRE',
    targetCandidateId: input.targetCandidateId,
    affectedTravelerIds: input.affectedTravelerIds ?? ['party_default'],
    physicalLoad: Math.round(physicalLoad * 1000) / 1000,
    scheduleStress: Math.round(scheduleStress * 1000) / 1000,
    recoveryDeficit: Math.round(recoveryDeficit * 1000) / 1000,
    cognitiveLoad: Math.min(1, scheduleStress * 0.8),
    missedWindowProbability: Math.min(1, deltaHours / 3),
    weakestMemberScore: Math.round((1 - physicalLoad) * 1000) / 1000,
    adjustmentRequirements: concernsToAdjustments(concerns),
    modelVersion: DRDRE_ROAD_MODEL_VERSION,
    inputSnapshotRef: input.inputSnapshotRef,
    confidence,
    createdAt: new Date().toISOString(),
  };
}

/** Strip updatedPlan from legacy DrDreStrategy output — RFC-001 never adopts it. */
export function stripDreUpdatedPlan(result: DecisionResult): DecisionResult {
  if (!result.updatedPlan) return result;
  const { updatedPlan: _discarded, ...rest } = result;
  void _discarded;
  return rest;
}

export function mergeDreStrategyIntoRoadLoadAssessment(
  roadAssessment: Rfc001LoadAssessment,
  dreResult: DecisionResult,
  mapInput: Omit<
    Parameters<typeof mapDreResultToAssessment>[0],
    'result'
  >,
): Rfc001LoadAssessment {
  const strategyAssessment = mapDreResultToAssessment({
    ...mapInput,
    result: stripDreUpdatedPlan(dreResult),
  });
  return {
    ...roadAssessment,
    physicalLoad: Math.max(
      roadAssessment.physicalLoad,
      strategyAssessment.physicalLoad,
    ),
    scheduleStress: Math.max(
      roadAssessment.scheduleStress,
      strategyAssessment.scheduleStress,
    ),
    recoveryDeficit: Math.max(
      roadAssessment.recoveryDeficit,
      strategyAssessment.recoveryDeficit,
    ),
    adjustmentRequirements: [
      ...roadAssessment.adjustmentRequirements,
      ...strategyAssessment.adjustmentRequirements,
    ],
    confidence: Math.min(roadAssessment.confidence, strategyAssessment.confidence),
    modelVersion: `${roadAssessment.modelVersion}+drdre-strategy`,
  };
}
