import type { AmbiguityReport } from './ambiguity-resolver';
import type { CalibrationSignal } from './flywheel-risk-feedback';
import type { FailureDriversReport, StochasticAggregate } from './parallel-decision-kernel';

/**
 * Reproducible Decision Trace — shadow / offline backtest fingerprint.
 * Kept in kernel (no dependency on actuator) to avoid circular imports.
 */

export type ShadowInterventionType = 'EMERGENCY_MELT' | 'FORCE_RETREAT' | 'WAITING_FOR_WINDOW' | 'NONE';

/** Minimal actuator snapshot stored with every shadow row (full JSON-safe). */
export type ShadowInterventionEnvelope = {
  action: 'MAINTAIN_GUIDANCE' | 'FORCE_RETREAT_MODE' | 'EMERGENCY_MELT_CUTOFF' | 'WAITING_FOR_WINDOW';
  mode: string;
  reasonCodes: string[];
  primaryMessage?: string;
  bullets?: string[];
  waiting?: { waitMinutes?: number; riskDrop01?: number };
  highlightShelter?: { id: string; name?: string; lat: number; lng: number; kind?: string };
};

export interface ShadowDecisionTrace {
  schemaVersion: 1;
  decisionId: string;
  timestamp: string;

  /** 1. 决策上下文 (The World as it was) */
  context: {
    contextKey: string;
    recentSignalCount: number;
    ambiguityGap: number;
    isEmergency: boolean;
  };

  /** 2. 决策支点 (The Pivot) */
  intervention: {
    type: ShadowInterventionType;
    triggerEdges: string[];
    primaryBullets: string[];
  };

  /** 3. 原始信号摘要 (Signal Snapshots) — 稳定 id 便于归因 */
  evidenceSignals: Array<{ id: string; weight: number }>;

  /** 完整模糊度报告（含 reason），用于复盘 AmbiguityResolver / 共识锁存 */
  ambiguity?: AmbiguityReport;

  /** 求解器标量摘要，支持离线重跑 alpha/beta */
  solver?: { alpha: number; beta: number };
  aggregate?: Pick<StochasticAggregate, 'n' | 'expectedRiskCost' | 'cvarRiskCost' | 'objective' | 'infeasibleWeight' | 'alpha' | 'beta'>;

  /** 实时观测（若有），用于包络线类干预归因 */
  realtimeState?: {
    at: string;
    lat: number;
    lng: number;
    speedMs?: number;
    delayMinutes?: number;
  };
}

export type ShadowDecisionLogPayload = {
  payloadVersion: 2;
  trace: ShadowDecisionTrace;
  intervention: ShadowInterventionEnvelope;
};

export type BuildShadowDecisionTraceInput = {
  contextKey: string;
  recentSignals: Array<CalibrationSignal & { at?: string; userId?: string; contextKey?: string }>;
  ambiguity?: AmbiguityReport;
  failureDrivers?: FailureDriversReport;
  intervention: ShadowInterventionEnvelope;
  aggregate: StochasticAggregate;
  alpha: number;
  beta: number;
  realtimeState?: ShadowDecisionTrace['realtimeState'];
  /** default 5 */
  topEvidenceSignals?: number;
  /** default 8 */
  topTriggerEdges?: number;
};

function newDecisionId(): string {
  try {
    const c = globalThis.crypto as { randomUUID?: () => string } | undefined;
    if (c?.randomUUID) return c.randomUUID();
  } catch {
    // ignore
  }
  return `dec-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function mapActionToInterventionType(action: ShadowInterventionEnvelope['action']): ShadowInterventionType {
  switch (action) {
    case 'EMERGENCY_MELT_CUTOFF':
      return 'EMERGENCY_MELT';
    case 'FORCE_RETREAT_MODE':
      return 'FORCE_RETREAT';
    case 'WAITING_FOR_WINDOW':
      return 'WAITING_FOR_WINDOW';
    default:
      return 'NONE';
  }
}

function calibrationSignalId(s: CalibrationSignal): string {
  return `${String(s.edgeId)}:${String(s.factor)}:${String(s.direction)}`;
}

/**
 * Build a stable, JSON-serializable trace for shadow rows and offline FP/FN analysis.
 */
export function buildShadowDecisionTrace(input: BuildShadowDecisionTraceInput): ShadowDecisionTrace {
  const amb = input.ambiguity;
  const k = Math.max(1, Math.min(20, input.topEvidenceSignals ?? 5));
  const m = Math.max(1, Math.min(32, input.topTriggerEdges ?? 8));

  const sortedSignals = [...(input.recentSignals ?? [])]
    .filter((s) => s && typeof (s as CalibrationSignal).strength01 === 'number')
    .sort((a, b) => ((b as CalibrationSignal).strength01 ?? 0) - ((a as CalibrationSignal).strength01 ?? 0));

  const evidenceSignals = sortedSignals.slice(0, k).map((s) => ({
    id: calibrationSignalId(s as CalibrationSignal),
    weight: Math.max(0, Math.min(1, Number((s as CalibrationSignal).strength01) || 0)),
  }));

  const triggerEdges = (input.failureDrivers?.topEdges ?? [])
    .slice(0, m)
    .map((e) => String(e.edgeId))
    .filter(Boolean);

  const primaryBullets = [
    ...(input.failureDrivers?.bullets ?? []),
    ...(input.intervention.bullets ?? []),
  ]
    .filter(Boolean)
    .slice(0, 8);

  const timestamp = new Date().toISOString();

  return {
    schemaVersion: 1,
    decisionId: newDecisionId(),
    timestamp,
    context: {
      contextKey: String(input.contextKey || 'UNKNOWN'),
      recentSignalCount: input.recentSignals?.length ?? 0,
      ambiguityGap: typeof amb?.gap01 === 'number' && Number.isFinite(amb.gap01) ? amb.gap01 : 0,
      isEmergency: !!amb?.isEmergency,
    },
    intervention: {
      type: mapActionToInterventionType(input.intervention.action),
      triggerEdges,
      primaryBullets,
    },
    evidenceSignals,
    ambiguity: amb,
    solver: { alpha: input.alpha, beta: input.beta },
    aggregate: {
      n: input.aggregate.n,
      expectedRiskCost: input.aggregate.expectedRiskCost,
      cvarRiskCost: input.aggregate.cvarRiskCost,
      objective: input.aggregate.objective,
      infeasibleWeight: input.aggregate.infeasibleWeight,
      alpha: input.aggregate.alpha,
      beta: input.aggregate.beta,
    },
    realtimeState: input.realtimeState,
  };
}

export function toShadowInterventionEnvelope(x: ShadowInterventionEnvelope): ShadowInterventionEnvelope {
  return {
    action: x.action,
    mode: x.mode,
    reasonCodes: [...(x.reasonCodes ?? [])],
    primaryMessage: x.primaryMessage,
    bullets: x.bullets ? [...x.bullets] : undefined,
    waiting: x.waiting,
    highlightShelter: x.highlightShelter,
  };
}
