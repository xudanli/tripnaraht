/**
 * PD-10 — Proactive Decision V1 Canary / Threshold SSOT.
 * Product + Algo freeze candidate; Push remains closed.
 */

import { resolveProactiveInterventionThreshold } from '../intervention/compute-intervention-value.util';
import { resolveProactiveDecisionFlagMatrix } from './proactive-decision-flag-matrix.util';

export const PROACTIVE_CANARY_CONFIG_SCHEMA =
  'nara.proactive_canary_config@v1' as const;

export type ProactiveCanaryStage =
  | 'SHADOW'
  | 'L1_PASSIVE'
  | 'L2_IN_APP_INTERRUPT'
  | 'PUSH'; // reserved — always disabled in V1

export type ProactiveCanaryAudience = {
  /** Iceland self-drive only */
  countryCode: 'IS';
  tripMode: 'SELF_DRIVE';
  /** Internal / dogfood allowlist trip ids (empty = none) */
  allowlistTripIds: string[];
  /** Percentage of eligible trips (0–100) */
  trafficPercent: number;
};

export type ProactiveCanaryMetricGate = {
  /** Minimum Accept Rate to advance stage */
  minAcceptRate: number;
  /** Maximum Silent-as-miss is not gated; max false-positive proxy */
  maxDeferRate: number;
  /** Minimum Useful feedback share when feedback present */
  minUsefulRate: number;
  /** Minimum CARD_SHOWN events before advance */
  minShownEvents: number;
};

export type ProactiveCanaryConfigV1 = {
  schemaId: typeof PROACTIVE_CANARY_CONFIG_SCHEMA;
  version: 1;
  stage: ProactiveCanaryStage;
  interventionThreshold: number;
  audience: ProactiveCanaryAudience;
  metricGates: ProactiveCanaryMetricGate;
  /** Allowed Decision Cases in canary */
  caseAllowlist: Array<
    'CASE_CONTINUE_ACTIVITY' | 'CASE_REROUTE' | 'CASE_POSTPONE_ACTIVITY'
  >;
  pushEnabled: false;
  autoApplyEnabled: false;
  /** Confirm/Apply write still requires separate flag */
  confirmApplyWriteRequiresFlag: true;
  rolloutNotesZh: string[];
};

export const DEFAULT_PROACTIVE_CANARY_METRIC_GATES: ProactiveCanaryMetricGate = {
  minAcceptRate: 0.25,
  maxDeferRate: 0.7,
  minUsefulRate: 0.5,
  minShownEvents: 30,
};

/**
 * Resolve canary SSOT from env (safe defaults = SHADOW).
 *
 * Env:
 * - PROACTIVE_CANARY_STAGE=SHADOW|L1_PASSIVE|L2_IN_APP_INTERRUPT
 * - PROACTIVE_INTERVENTION_THRESHOLD (shared with gate)
 * - PROACTIVE_CANARY_TRAFFIC_PERCENT=0..100
 * - PROACTIVE_CANARY_TRIP_ALLOWLIST=id1,id2
 */
export function resolveProactiveCanaryConfig(
  env: NodeJS.ProcessEnv = process.env,
): ProactiveCanaryConfigV1 {
  const matrix = resolveProactiveDecisionFlagMatrix(env);
  const stageRaw = (env.PROACTIVE_CANARY_STAGE ?? 'SHADOW').trim().toUpperCase();
  let stage: ProactiveCanaryStage = 'SHADOW';
  if (stageRaw === 'L1_PASSIVE') stage = 'L1_PASSIVE';
  else if (stageRaw === 'L2_IN_APP_INTERRUPT') stage = 'L2_IN_APP_INTERRUPT';
  else if (stageRaw === 'PUSH') {
    // V1 forbids Push stage elevation
    stage = 'L2_IN_APP_INTERRUPT';
  }

  if (!matrix.proactiveV1Enabled) {
    stage = 'SHADOW';
  }

  const traffic = Number(env.PROACTIVE_CANARY_TRAFFIC_PERCENT ?? '0');
  const trafficPercent = Number.isFinite(traffic)
    ? Math.max(0, Math.min(100, traffic))
    : 0;

  const allowlistTripIds = (env.PROACTIVE_CANARY_TRIP_ALLOWLIST ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    schemaId: PROACTIVE_CANARY_CONFIG_SCHEMA,
    version: 1,
    stage,
    interventionThreshold: resolveProactiveInterventionThreshold(env),
    audience: {
      countryCode: 'IS',
      tripMode: 'SELF_DRIVE',
      allowlistTripIds,
      trafficPercent,
    },
    metricGates: { ...DEFAULT_PROACTIVE_CANARY_METRIC_GATES },
    caseAllowlist: [
      'CASE_CONTINUE_ACTIVITY',
      'CASE_REROUTE',
      'CASE_POSTPONE_ACTIVITY',
    ],
    pushEnabled: false,
    autoApplyEnabled: false,
    confirmApplyWriteRequiresFlag: true,
    rolloutNotesZh: [
      '默认 SHADOW：只跑编排与埋点，不展示打扰卡',
      'Stage 0 Shadow Log：PD V1 开即可 100% 记录 wouldNotify/quality/Decision Trace（PROACTIVE_SHADOW_RECORD_ENABLED）',
      'L1_PASSIVE：应用内被动表面（非打断）',
      'L2_IN_APP_INTERRUPT：应用内打断卡（仍禁止 Push / AutoApply）',
      'Confirm→Apply 写链另需 PROACTIVE_DECISION_CONFIRM_APPLY_WRITE_ENABLED=1',
    ],
  };
}

export function isTripInProactiveCanaryAudience(input: {
  config: ProactiveCanaryConfigV1;
  tripId: string;
}): boolean {
  const { config, tripId } = input;
  if (config.stage === 'SHADOW' && config.audience.trafficPercent <= 0) {
    return config.audience.allowlistTripIds.includes(tripId);
  }
  if (config.audience.allowlistTripIds.length > 0) {
    return config.audience.allowlistTripIds.includes(tripId);
  }
  if (config.audience.trafficPercent <= 0) return false;
  // Stable bucket from tripId
  let hash = 0;
  for (let i = 0; i < tripId.length; i += 1) {
    hash = (hash * 31 + tripId.charCodeAt(i)) >>> 0;
  }
  return hash % 100 < config.audience.trafficPercent;
}

export function shouldSurfaceProactiveCard(input: {
  config: ProactiveCanaryConfigV1;
  tripId: string;
  gate: 'NOTIFY_CARD' | 'SILENT_LEARNING';
}): boolean {
  /** @deprecated Prefer L1/L2 specific helpers; kept as “any user-visible surface”. */
  return (
    shouldSurfaceProactiveL1Passive(input) ||
    shouldSurfaceProactiveL2Interrupt(input)
  );
}

/** L1 Passive：执行首页 / 今日行程条带，非打断卡 */
export function shouldSurfaceProactiveL1Passive(input: {
  config: ProactiveCanaryConfigV1;
  tripId: string;
  gate: 'NOTIFY_CARD' | 'SILENT_LEARNING';
}): boolean {
  if (input.gate !== 'NOTIFY_CARD') return false;
  if (input.config.stage !== 'L1_PASSIVE') return false;
  return isTripInProactiveCanaryAudience({
    config: input.config,
    tripId: input.tripId,
  });
}

/** L2 Interrupt：三层打断卡（仅 High Value） */
export function shouldSurfaceProactiveL2Interrupt(input: {
  config: ProactiveCanaryConfigV1;
  tripId: string;
  gate: 'NOTIFY_CARD' | 'SILENT_LEARNING';
  /** When omitted, audience+stage only — prefer passing High-Value verdict from assemble */
  highValueOk?: boolean;
}): boolean {
  if (input.gate !== 'NOTIFY_CARD') return false;
  if (input.config.stage !== 'L2_IN_APP_INTERRUPT') return false;
  if (
    !isTripInProactiveCanaryAudience({
      config: input.config,
      tripId: input.tripId,
    })
  ) {
    return false;
  }
  // Default true for backward-compatible stage checks; assemble always passes explicit flag
  if (input.highValueOk === false) return false;
  return true;
}

export type ProactiveCanaryAdvanceVerdict = {
  mayAdvance: boolean;
  reasonsZh: string[];
};

export function evaluateProactiveCanaryAdvance(input: {
  config: ProactiveCanaryConfigV1;
  shown: number;
  acceptRate: number | null;
  deferRate: number | null;
  usefulRate: number | null;
}): ProactiveCanaryAdvanceVerdict {
  const reasonsZh: string[] = [];
  const g = input.config.metricGates;

  if (input.shown < g.minShownEvents) {
    reasonsZh.push(`展示量不足（${input.shown}/${g.minShownEvents}）`);
  }
  if (input.acceptRate == null || input.acceptRate < g.minAcceptRate) {
    reasonsZh.push(
      `Accept Rate 未达门禁（${input.acceptRate ?? 'n/a'} < ${g.minAcceptRate}）`,
    );
  }
  if (input.deferRate != null && input.deferRate > g.maxDeferRate) {
    reasonsZh.push(
      `Defer Rate 过高（${input.deferRate} > ${g.maxDeferRate}）`,
    );
  }
  if (input.usefulRate != null && input.usefulRate < g.minUsefulRate) {
    reasonsZh.push(
      `Useful Rate 未达门禁（${input.usefulRate} < ${g.minUsefulRate}）`,
    );
  }

  return {
    mayAdvance: reasonsZh.length === 0,
    reasonsZh,
  };
}
