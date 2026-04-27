import { createHash } from 'crypto';
import type { UserRepairResolutionLabel } from '../decision-state.types';

const USER_REPAIR_RESOLUTION_VALUES: UserRepairResolutionLabel[] = [
  'ACCEPTED_AUTO_REPAIR',
  'RELAXED_CONSTRAINTS',
  'PROCEED_REGARDLESS',
  'ABANDONED',
];

export function isUserRepairResolutionLabel(v: string): v is UserRepairResolutionLabel {
  return (USER_REPAIR_RESOLUTION_VALUES as readonly string[]).includes(v);
}

/** 指纹语义阶段（与 Harness 步名解耦：先知卡归因 INTAKE 编译仿真） */
export type DecisionFeedbackCorrelationPhase = 'INTAKE' | 'REPAIR';

/** 指纹种类：漏斗分层 / 离线 join */
export type DecisionFeedbackCorrelationKind = 'PREDICTIVE_FAILURE' | 'REPAIR_ESCALATION';

export interface BuildDecisionFeedbackCorrelationIdParams {
  sessionId: string;
  phase: DecisionFeedbackCorrelationPhase;
  kind: DecisionFeedbackCorrelationKind;
  /**
   * - INTAKE / PREDICTIVE_FAILURE：v1 默认 0（初始意图编译轮次）
   * - REPAIR / REPAIR_ESCALATION：本请求内第几次完成 REPAIR（与 `systemState.repairCount` 对齐）
   */
  roundIndex: number;
  /** 因果现场摘要（16hex 或任意稳定短串，会进入 material） */
  stateHash: string;
}

/**
 * correlation_id = sha256(sessionId|phase|kind|roundIndex|stateHash) 截断 40hex。
 * 与 REPAIR 效用补偿、INTAKE 先知卡共用同一套 join 键空间（按 kind/phase 分流）。
 */
export function buildDecisionFeedbackCorrelationId(params: BuildDecisionFeedbackCorrelationIdParams): string {
  const { sessionId, phase, kind, roundIndex, stateHash } = params;
  const material = `${sessionId}|${phase}|${kind}|${roundIndex}|${stateHash}`;
  return createHash('sha256').update(material, 'utf8').digest('hex').slice(0, 40);
}

export function computeRepairInterventionStateHash(input: {
  dsoVersion: number;
  escalationReason?: string;
  utilityDeltaSum: number;
  planDigest: string;
}): string {
  const u = Math.round(input.utilityDeltaSum * 1000) / 1000;
  const canonical = JSON.stringify({
    v: input.dsoVersion,
    r: input.escalationReason ?? '',
    u,
    p: input.planDigest,
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, 16);
}

/** 轻量草案指纹：避免全量 JSON 抖动，仅天界 + item id。 */
export function digestPlanDraftForCorrelation(planDraft: unknown): string {
  const p = planDraft as { request_id?: string; days?: Array<{ date?: string; items?: Array<{ id?: string }> }> } | null;
  if (!p?.days?.length) {
    const rid = typeof p?.request_id === 'string' ? p.request_id : '';
    return createHash('sha256').update(`empty|${rid}`, 'utf8').digest('hex').slice(0, 12);
  }
  const parts = p.days.map((d) => {
    const ids = (d.items ?? []).map((it) => String(it?.id ?? '')).join(',');
    return `${d.date ?? ''}:${ids}`;
  });
  return createHash('sha256').update(parts.join('|'), 'utf8').digest('hex').slice(0, 16);
}

/** SimulatedRepairTrace[] 的稳定摘要（ tactic / reason / utility / boundary ） */
export function digestSimulatedRepairTracesForCorrelation(traces: unknown[]): string {
  const norm = (Array.isArray(traces) ? traces : []).map((raw: any) => {
    const eu = raw?.estimated_utility_delta;
    const mu = raw?.metrics?.utility_delta;
    const v =
      typeof eu === 'number' && Number.isFinite(eu)
        ? eu
        : typeof mu === 'number' && Number.isFinite(mu)
          ? mu
          : 0;
    return {
      tid: String(raw?.tacticId ?? ''),
      r: String(raw?.reason ?? ''),
      u: Math.round(v * 1000) / 1000,
      bid: String(raw?.simulation?.boundary_id ?? ''),
    };
  });
  return createHash('sha256').update(JSON.stringify(norm), 'utf8').digest('hex').slice(0, 16);
}

/** TripPlanRequest 轻量指纹（意图侧，无草案时仍可用） */
export function digestTripPlanRequestLight(trip: unknown): string {
  const tr = trip as {
    origin?: string;
    destination?: string;
    days?: number;
    must_include_poi_ids?: string[];
    date_range?: { start_date?: string; end_date?: string };
  };
  const must = [...(tr?.must_include_poi_ids ?? [])].sort().join(',');
  const canonical = JSON.stringify({
    o: tr?.origin ?? '',
    d: tr?.destination ?? '',
    days: typeof tr?.days === 'number' && Number.isFinite(tr.days) ? tr.days : null,
    dr: tr?.date_range ?? null,
    must,
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, 16);
}

/** 先知卡专用 stateHash（DSO 版本 + 仿真迹 + 意图） */
export function computePredictiveFailureStateHash(input: {
  dsoVersion: number;
  simulatedTracesDigest: string;
  tripDigest: string;
}): string {
  const canonical = JSON.stringify({
    v: input.dsoVersion,
    s: input.simulatedTracesDigest,
    t: input.tripDigest,
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, 16);
}
