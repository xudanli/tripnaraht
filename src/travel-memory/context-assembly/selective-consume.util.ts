/**
 * 选择性 CONSUME — 不取代旧 Memory OS。
 *
 * 门控通过时：产出决策提示 + Contribution Preview（used=false，直至 Solver 证明影响）。
 * 门控失败：保持 Shadow 观测，不注入 consume 切片。
 */

import type { MemoryContextPackage } from '../types/memory-context-package.types';
import type {
  MemoryContributionItemV1,
  MemoryDecisionTraceV1,
} from '../runtime/memory-decision-trace.types';
import type { AssembledTravelContextV1 } from './assembled-context.types';

export type TravelMemoryConsumeGateV1 = {
  allowed: boolean;
  reasons: string[];
};

export type TravelMemoryDecisionHintV1 = {
  key: string;
  value: unknown;
  influence: MemoryContributionItemV1['influence'];
  confidence: number;
  memoryId: string;
  /** 明确：建议依据，不是当前硬禁止 */
  advisoryOnly: true;
};

/**
 * 挂到 request / tick 的选择性消费投影（≠ 旧 Memory OS 替换）。
 */
export type TravelMemoryConsumeProjectionV1 = {
  schemaId: 'tripnara.travel_memory_consume_projection@v1';
  version: 1;
  mode: 'CONSUME';
  gate: TravelMemoryConsumeGateV1;
  /** 分槽摘要：禁止与 Contract/Self-drive 融合解读 */
  slots: {
    memoryKeys: string[];
    contractConstraints: string[];
    selfDriveKeys: string[];
  };
  decisionHints: TravelMemoryDecisionHintV1[];
  /**
   * Contribution Preview：eligible 时 used 仍为 false，
   * 防止「装载了 = 影响了」假提升。
   */
  contributionPreview: MemoryDecisionTraceV1['memoryContribution'] & {
    eligible: boolean;
  };
  memoryDecisionSafe: boolean;
};

const DEFAULT_TASK_ALLOW =
  /GLACIER|冰川|ACTIVITY|SHOULD_WE_DO_|ROUTE|ITINERARY|PLAN|SELF_DRIVE|自驾|F-ROAD|ICELAND|冰岛|南岸|环岛/i;

export function resolveConsumeTaskAllowRegex(
  env: NodeJS.ProcessEnv = process.env,
): RegExp {
  const raw = String(env.TRAVEL_CONTEXT_CONSUME_TASKS ?? '').trim();
  if (!raw) return DEFAULT_TASK_ALLOW;
  try {
    return new RegExp(raw, 'i');
  } catch {
    return DEFAULT_TASK_ALLOW;
  }
}

export function evaluateSelectiveConsumeGate(
  ctx: AssembledTravelContextV1,
  opts?: { taskAllow?: RegExp },
): TravelMemoryConsumeGateV1 {
  const reasons: string[] = [];
  if (ctx.mode !== 'CONSUME') {
    reasons.push('mode_not_consume');
  }
  if (!ctx.memoryDecisionSafe) {
    reasons.push('memory_not_decision_safe');
  }
  if (!ctx.memory) {
    reasons.push('memory_slice_missing');
  }
  const allow = opts?.taskAllow ?? DEFAULT_TASK_ALLOW;
  const taskHay = `${ctx.task} ${ctx.contract.memoryContractTask ?? ''}`;
  if (!allow.test(taskHay)) {
    reasons.push('task_not_in_consume_allowlist');
  }
  const hints = ctx.memory ? extractDecisionHints(ctx.memory) : [];
  if (ctx.memory && hints.length === 0) {
    reasons.push('no_usable_memory_hints');
  }
  return { allowed: reasons.length === 0, reasons };
}

function fieldMemoryId(
  evidenceEventIds: string[] | undefined,
  fallback: string,
): string {
  const id = evidenceEventIds?.[0];
  return id && id.trim() ? id : fallback;
}

export function extractDecisionHints(
  memory: MemoryContextPackage,
): TravelMemoryDecisionHintV1[] {
  const hints: TravelMemoryDecisionHintV1[] = [];
  const pace = memory.structured.pace;
  if (pace && pace.status !== 'CANDIDATE') {
    hints.push({
      key: 'travel.pace',
      value: pace.value,
      influence: 'PACE_CONSTRAINT',
      confidence: pace.confidence,
      memoryId: fieldMemoryId(pace.evidenceEventIds, 'structured.pace'),
      advisoryOnly: true,
    });
  }
  const risk = memory.structured.riskTolerance;
  if (risk && risk.status !== 'CANDIDATE') {
    hints.push({
      key: 'decision.riskTolerance',
      value: risk.value,
      influence: 'RISK_PREFERENCE',
      confidence: risk.confidence,
      memoryId: fieldMemoryId(risk.evidenceEventIds, 'structured.risk'),
      advisoryOnly: true,
    });
  }
  const trip = memory.tripMemory;
  if (trip?.paceOverride && trip.paceOverride.status !== 'CANDIDATE') {
    hints.push({
      key: 'trip.paceOverride',
      value: trip.paceOverride.value,
      influence: 'TRIP_OVERRIDE',
      confidence: trip.paceOverride.confidence,
      memoryId: fieldMemoryId(
        trip.paceOverride.evidenceEventIds,
        'trip.paceOverride',
      ),
      advisoryOnly: true,
    });
  }
  if (trip?.temporaryConstraints && trip.temporaryConstraints.status !== 'CANDIDATE') {
    hints.push({
      key: 'trip.temporaryConstraints',
      value: trip.temporaryConstraints.value,
      influence: 'MEMBER_CONSTRAINT',
      confidence: trip.temporaryConstraints.confidence,
      memoryId: fieldMemoryId(
        trip.temporaryConstraints.evidenceEventIds,
        'trip.constraints',
      ),
      advisoryOnly: true,
    });
  }
  for (const ep of memory.relevantEpisodes.slice(0, 3)) {
    const regret = ep.reflection?.decisionRegret;
    const regretNum =
      typeof regret === 'number'
        ? regret
        : regret === 'HIGH'
          ? 0.8
          : regret === 'MEDIUM'
            ? 0.5
            : null;
    if (regretNum != null && regretNum >= 0.4) {
      hints.push({
        key: `episode.${ep.episodeId}`,
        value: {
          decisionType: ep.decision.type,
          regret: regret ?? null,
        },
        influence: 'EPISODE_WARNING',
        confidence: Math.min(1, 0.4 + regretNum * 0.5),
        memoryId: ep.episodeId,
        advisoryOnly: true,
      });
    }
  }
  return hints;
}

function hintsToInfluence(
  hints: TravelMemoryDecisionHintV1[],
): MemoryContributionItemV1[] {
  return hints.map((h) => ({
    id: h.memoryId,
    memoryId: h.memoryId,
    influence: h.influence,
    weight: Number((h.confidence * 0.5).toFixed(3)),
    confidence: h.confidence,
  }));
}

/**
 * 构建选择性消费投影。gate 失败时仍返回对象（allowed=false），调用方勿注入主决策。
 */
export function buildSelectiveConsumeProjection(
  ctx: AssembledTravelContextV1,
  opts?: { taskAllow?: RegExp; decisionId?: string },
): TravelMemoryConsumeProjectionV1 {
  const gate = evaluateSelectiveConsumeGate(ctx, { taskAllow: opts?.taskAllow });
  const hints =
    gate.allowed && ctx.memory ? extractDecisionHints(ctx.memory) : [];
  const influence = hintsToInfluence(hints);

  return {
    schemaId: 'tripnara.travel_memory_consume_projection@v1',
    version: 1,
    mode: 'CONSUME',
    gate,
    slots: {
      memoryKeys: hints.map((h) => h.key),
      contractConstraints: ctx.decisionContract?.constraints ?? [],
      selfDriveKeys: ctx.selfDriveWorld?.keys ?? [],
    },
    decisionHints: hints,
    contributionPreview: {
      eligible: gate.allowed && influence.length > 0,
      used: false,
      influence,
    },
    memoryDecisionSafe: ctx.memoryDecisionSafe,
  };
}

/** 观测摘要（避免全量 hints 灌 tick） */
export function consumeProjectionToObservability(
  proj: TravelMemoryConsumeProjectionV1,
): Record<string, unknown> {
  return {
    schemaId: proj.schemaId,
    mode: proj.mode,
    gateAllowed: proj.gate.allowed,
    gateReasons: proj.gate.reasons,
    hintCount: proj.decisionHints.length,
    hintKeys: proj.decisionHints.map((h) => h.key),
    contributionEligible: proj.contributionPreview.eligible,
    contributionUsed: proj.contributionPreview.used,
    influenceKinds: proj.contributionPreview.influence.map((i) => i.influence),
    slots: proj.slots,
    memoryDecisionSafe: proj.memoryDecisionSafe,
  };
}
