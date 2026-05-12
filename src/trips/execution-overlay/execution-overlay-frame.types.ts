/**
 * P4-ALL Execution Overlay Runtime — single consumption contract for route / weather / temporal / road / repair.
 */

import type { RouteExecutionAssessment } from '../routing/execution/route-execution-assessment.types';
import type { ExecutionState } from '../decision/hazard/travel-hazard.types';

/**
 * P-Next 3 — Observed execution outcome on the trace layer (materialized from PhysicsFieldIndex).
 * Same wire shape as {@link ExecutionState}; semantics are **non-authoritative** narrative.
 */
export type ExecutionOutcomeTrace = ExecutionState;
import type { FuelReachabilitySummary } from '../fuel/fuel-reachability.types';

/** P5-FINAL schema freeze — bump only with intentional migration / codemod. */
export const EXECUTION_OVERLAY_SCHEMA_VERSION = '1' as const;

export type WeatherOverlaySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKED';

export interface ExecutionOverlayFrame {
  /** 与 {@link EXECUTION_OVERLAY_SCHEMA_VERSION} 对齐；禁止静默增字段越过审查 */
  schemaVersion: typeof EXECUTION_OVERLAY_SCHEMA_VERSION;

  legId: string;

  route: RouteExecutionAssessment;

  temporal: {
    /** Sum of PROPAGATE_SEQUENCE drift minutes attributed to this leg (merged pipeline). */
    driftMinutes: number;
    /** 0–1 spill risk proxy when cross-day propagation touches this slot or day. */
    crossDayRisk: number;
    daylightViolation: boolean;
    /**
     * P5-CLOSE：与根级 `unifiedDelayMinutes` 同源镜像（单一延误真相；materialization 管道不得单独解释）。
     */
    unifiedDelayMinutes: number;
  };

  weather: {
    severity: WeatherOverlaySeverity;
    delayFactor: number;
  };

  road: {
    blocked: boolean;
    fRoadConstraint: boolean;
  };

  /** P-FUEL-1：能量约束物理投影 — 与 temporal/weather/road 并行合成 finalExecutionState */
  fuel?: FuelReachabilitySummary;

  repair: {
    recommended: boolean;
    /** Primary repair action when multiple (lowest priority number). */
    type?: string;
  };

  /** Observed outcome trace when physics authority applied — not an independent decision merge. */
  finalExecutionState: ExecutionOutcomeTrace;

  /** Single fused delay budget (minutes) for this leg — see builder fusion policy. */
  unifiedDelayMinutes: number;

  /** 0–1 fused execution confidence (lower = more elastic / uncertain schedule). */
  reliabilityScore: number;

  /**
   * 非物理执行域与派生投影（P5-FINAL）：单一真相上的标注层，替代各自独立 decision branch。
   */
  annotations?: ExecutionOverlayAnnotations;
}

/** Temporal = projection of overlay fields，不是独立 drift 系统（PR-B）。 */
export type TemporalProjectionSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface DerivedTemporalProjection {
  unifiedDelayMinutes: number;
  crossDayRisk: number;
  driftMinutes: number;
  temporalSeverity: TemporalProjectionSeverity;
}

export interface ExecutionOverlayAnnotations {
  /** P-Next 3 — Fusion-time label before physics authority overwrite (audit / replay). */
  legacyFusionExecutionState?: ExecutionState;
  /** P-Next 3 — Physics row wrote observed outcome fields on this frame. */
  physicsAuthorityApplied?: boolean;
  /** P-Next 3 — Unified physics derived phase for this leg (debug mapping). */
  physicsDerived?: import('../physics/unified-physics-field.types').UnifiedPhysicsDerivedState;
  temporalProjection?: DerivedTemporalProjection;
  /** 与 `signals.auroraOpportunityByDate` 对齐的单日机会分（0–1） */
  auroraOpportunityScore?: number;
  /** 与 opportunityScore 同源的可观测副本（explainability） */
  auroraScore?: number;
  /** 驾驶/机动预算应力代理（分钟）— explainability / Neptune policy hint only */
  mobilityDeltaMinutes?: number;
  bookingImpact?: {
    hotelLateCheckinRisk?: boolean;
  };
}
