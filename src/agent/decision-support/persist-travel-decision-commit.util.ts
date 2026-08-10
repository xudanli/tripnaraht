/**
 * 将已 Commit 的 TravelDecisionProblem 写入 trip.metadata：
 * - travelDecisionCommitments（对话决策账本）
 * - travelDecisionLatest（扁平镜像）
 * - travelDecisionContract（约束控制台 SSOT 可读合同）
 * - 清理 travelDecisionOpenProblems 中对应条目
 *
 * 不触碰行程 items — Itinerary Runtime 另走草案。
 */

import {
  mergeStoredTravelDecisionContract,
  readStoredTravelDecisionContract,
} from '../../trips/trip-constraint-solver/utils/travel-decision-contract.builder';
import type {
  TravelDecisionContractPatch,
  TravelPrincipleKey,
} from '../../trips/trip-constraint-solver/types/travel-decision-contract.types';
import type { TravelDecisionProblem } from './travel-decision.types';
import { applyDecisionCommitmentToIcelandMetadata } from './apply-decision-to-iceland-metadata.util';

export const TRAVEL_DECISION_COMMITMENTS_META_KEY = 'travelDecisionCommitments' as const;
export const TRAVEL_DECISION_OPEN_META_KEY = 'travelDecisionOpenProblems' as const;

export type TravelDecisionCommitmentRecord = {
  decisionId: string;
  decisionKey: string;
  optionId: string;
  label_zh?: string;
  persistenceTarget: string;
  selectedAt: string;
  selectedBy?: string;
  /** 映射到合同/偏好的结构化字段 */
  contractPatch: Record<string, unknown>;
};

export type TravelDecisionCommitmentsMeta = {
  schema_id: 'tripnara.travel_decision_commitments@v1';
  version: number;
  updatedAt: string;
  byKey: Record<string, TravelDecisionCommitmentRecord>;
  history: TravelDecisionCommitmentRecord[];
};

export type TravelDecisionOpenProblemsMeta = {
  schema_id: 'tripnara.travel_decision_open_problems@v1';
  updatedAt: string;
  /** decisionId → problem（未 Commit） */
  byId: Record<string, TravelDecisionProblem>;
};

export function buildContractPatchForDecision(
  problem: TravelDecisionProblem,
): Record<string, unknown> {
  const optionId = problem.selection?.optionId ?? '';
  switch (problem.decisionKey) {
    case 'VEHICLE_ROAD_FIT':
      return {
        vehicle_requirement: optionId,
        vehicle_drive: optionId === '2WD' ? '2WD' : '4WD',
      };
    case 'RENTAL_INSURANCE':
      return { rental_insurance_tier: optionId };
    case 'TRIP_SCOPE':
      return {
        trip_scope: optionId,
        route_strategy: optionId,
        priority:
          optionId === 'SOUTH_COAST'
            ? 'STABILITY_OVER_COVERAGE'
            : optionId === 'RING_ROAD'
              ? 'COVERAGE_OVER_STABILITY'
              : 'BALANCED_COVERAGE',
      };
    case 'ACCOMMODATION_MOVEMENT':
      return {
        accommodation_strategy: optionId,
        optimization_objective:
          optionId === 'HUB_STAY'
            ? 'FEWER_HOTEL_CHANGES'
            : optionId === 'FOLLOW_ROUTE'
              ? 'MINIMIZE_DAILY_DRIVE'
              : 'HYBRID_HUBS',
        ranked_principle_boost:
          optionId === 'HUB_STAY' ? 'FEWER_HOTEL_CHANGES' : 'PACE',
      };
    case 'GLACIER_HIKE':
    case 'SILFRA_SNORKELING':
      return {
        experience_preference: {
          [problem.decisionKey]: optionId,
        },
      };
    case 'ARRIVAL_DAY_LOAD':
    case 'DAILY_PACE':
      return { pace_strategy: optionId };
    case 'WINTER_ROUTE_RISK':
      return { winter_route_policy: optionId };
    case 'LIVE_CONTINUE_OR_ABORT':
      return { live_execution_choice: optionId };
    default:
      return {
        [`decision_${problem.decisionKey}`]: optionId,
      };
  }
}

/** 将对话决策提升为 travelDecisionContract patch */
export function buildTravelDecisionContractPatchFromProblem(
  problem: TravelDecisionProblem,
): TravelDecisionContractPatch | null {
  const optionId = problem.selection?.optionId ?? '';
  if (!optionId) return null;

  let ranked: TravelPrincipleKey[] | undefined;
  let changeStrategy: TravelDecisionContractPatch['changeStrategy'];

  switch (problem.decisionKey) {
    case 'TRIP_SCOPE':
      if (optionId === 'SOUTH_COAST') {
        ranked = ['SAFETY', 'PACE', 'CORE_EXPERIENCE', 'FLEXIBILITY', 'COVERAGE'];
        changeStrategy = { archetype: 'CONSERVATIVE' };
      } else if (optionId === 'RING_ROAD') {
        ranked = ['COVERAGE', 'CORE_EXPERIENCE', 'SAFETY', 'PACE', 'BUDGET'];
        changeStrategy = { archetype: 'EXPLORATORY' };
      } else {
        ranked = ['CORE_EXPERIENCE', 'SAFETY', 'PACE', 'COVERAGE', 'FLEXIBILITY'];
        changeStrategy = { archetype: 'BALANCED' };
      }
      break;
    case 'ACCOMMODATION_MOVEMENT':
      ranked =
        optionId === 'HUB_STAY'
          ? ['FEWER_HOTEL_CHANGES', 'PACE', 'SAFETY', 'CORE_EXPERIENCE']
          : optionId === 'FOLLOW_ROUTE'
            ? ['PACE', 'COVERAGE', 'FEWER_HOTEL_CHANGES', 'SAFETY']
            : ['PACE', 'FEWER_HOTEL_CHANGES', 'CORE_EXPERIENCE', 'SAFETY'];
      break;
    case 'DAILY_PACE':
      ranked =
        optionId === 'EASY'
          ? ['PACE', 'SAFETY', 'FAMILY_COMFORT', 'CORE_EXPERIENCE']
          : optionId === 'RICH'
            ? ['CORE_EXPERIENCE', 'COVERAGE', 'PACE', 'SAFETY']
            : ['CORE_EXPERIENCE', 'PACE', 'SAFETY', 'COVERAGE'];
      break;
    case 'WINTER_ROUTE_RISK':
      if (optionId === 'CONSERVATIVE') {
        ranked = ['SAFETY', 'PACE', 'FLEXIBILITY', 'CORE_EXPERIENCE'];
        changeStrategy = { archetype: 'CONSERVATIVE' };
      } else if (optionId === 'KEEP') {
        ranked = ['CORE_EXPERIENCE', 'COVERAGE', 'SAFETY', 'PACE'];
        changeStrategy = { archetype: 'EXPLORATORY' };
      } else {
        ranked = ['SAFETY', 'FLEXIBILITY', 'CORE_EXPERIENCE', 'PACE'];
        changeStrategy = { archetype: 'BALANCED' };
      }
      break;
    case 'VEHICLE_ROAD_FIT':
      if (optionId === '2WD') {
        ranked = ['BUDGET', 'SAFETY', 'PACE', 'CORE_EXPERIENCE'];
        changeStrategy = {
          archetype: 'CONSERVATIVE',
          tolerances: { allowSameDayReroute: true },
        };
      } else {
        ranked = ['SAFETY', 'FLEXIBILITY', 'CORE_EXPERIENCE', 'BUDGET'];
      }
      break;
    case 'ARRIVAL_DAY_LOAD':
      ranked =
        optionId === 'LIGHT' || optionId === 'MODERATE'
          ? ['PACE', 'SAFETY', 'FAMILY_COMFORT', 'CORE_EXPERIENCE']
          : ['COVERAGE', 'CORE_EXPERIENCE', 'PACE', 'SAFETY'];
      break;
    default:
      return null;
  }

  const patch: TravelDecisionContractPatch = {};
  if (ranked?.length) patch.objectives = { rankedPrinciples: ranked };
  if (changeStrategy) patch.changeStrategy = changeStrategy;
  return Object.keys(patch).length ? patch : null;
}

export function upsertOpenTravelDecisionIntoMetadata(
  existingMetadata: unknown,
  problem: TravelDecisionProblem,
): Record<string, unknown> {
  const prev =
    existingMetadata && typeof existingMetadata === 'object'
      ? ({ ...(existingMetadata as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const raw = prev[TRAVEL_DECISION_OPEN_META_KEY] as TravelDecisionOpenProblemsMeta | undefined;
  const byId = { ...(raw?.byId ?? {}) };
  if (
    problem.state === 'COMMITTED' ||
    problem.state === 'CANCELLED' ||
    problem.state === 'SUPERSEDED'
  ) {
    delete byId[problem.decisionId];
  } else {
    byId[problem.decisionId] = problem;
  }
  /** 同 key 只保留最新开放题 */
  for (const [id, p] of Object.entries(byId)) {
    if (id !== problem.decisionId && p.decisionKey === problem.decisionKey) {
      delete byId[id];
    }
  }
  const next: TravelDecisionOpenProblemsMeta = {
    schema_id: 'tripnara.travel_decision_open_problems@v1',
    updatedAt: new Date().toISOString(),
    byId,
  };
  return { ...prev, [TRAVEL_DECISION_OPEN_META_KEY]: next };
}

export function mergeTravelDecisionCommitmentIntoMetadata(
  existingMetadata: unknown,
  problem: TravelDecisionProblem,
): Record<string, unknown> {
  let prev =
    existingMetadata && typeof existingMetadata === 'object'
      ? ({ ...(existingMetadata as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  const opt = problem.options.find((o) => o.optionId === problem.selection?.optionId);
  const record: TravelDecisionCommitmentRecord = {
    decisionId: problem.decisionId,
    decisionKey: problem.decisionKey,
    optionId: String(problem.selection?.optionId ?? ''),
    label_zh: opt?.label_zh,
    persistenceTarget: problem.persistenceTarget,
    selectedAt: problem.selection?.selectedAt ?? new Date().toISOString(),
    selectedBy: problem.selection?.selectedBy,
    contractPatch: buildContractPatchForDecision(problem),
  };

  const raw = prev[TRAVEL_DECISION_COMMITMENTS_META_KEY] as
    | TravelDecisionCommitmentsMeta
    | undefined;
  const byKey = { ...(raw?.byKey ?? {}) };
  byKey[problem.decisionKey] = record;
  const history = [record, ...(raw?.history ?? [])].slice(0, 40);

  const next: TravelDecisionCommitmentsMeta = {
    schema_id: 'tripnara.travel_decision_commitments@v1',
    version: (raw?.version ?? 0) + 1,
    updatedAt: new Date().toISOString(),
    byKey,
    history,
  };

  prev = {
    ...prev,
    [TRAVEL_DECISION_COMMITMENTS_META_KEY]: next,
    travelDecisionLatest: {
      ...(typeof prev.travelDecisionLatest === 'object' && prev.travelDecisionLatest
        ? (prev.travelDecisionLatest as Record<string, unknown>)
        : {}),
      ...record.contractPatch,
      _lastDecisionKey: problem.decisionKey,
      _lastOptionId: record.optionId,
      _updatedAt: record.selectedAt,
    },
  };

  /** 写入正式 travelDecisionContract */
  const contractPatch = buildTravelDecisionContractPatchFromProblem(problem);
  if (contractPatch) {
    const existingContract = readStoredTravelDecisionContract(prev);
    prev.travelDecisionContract = mergeStoredTravelDecisionContract(
      existingContract,
      contractPatch,
    );
  }

  /** 从开放队列移除 */
  prev = upsertOpenTravelDecisionIntoMetadata(prev, {
    ...problem,
    state: 'COMMITTED',
  });

  /** 冰岛自驾车型 / 节奏 / 路线策略镜像 */
  prev = applyDecisionCommitmentToIcelandMetadata(prev, problem);

  return prev;
}

export function readTravelDecisionCommitments(
  metadata: unknown,
): TravelDecisionCommitmentsMeta | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = (metadata as Record<string, unknown>)[TRAVEL_DECISION_COMMITMENTS_META_KEY];
  if (!raw || typeof raw !== 'object') return null;
  return raw as TravelDecisionCommitmentsMeta;
}

export function readOpenTravelDecisionProblems(
  metadata: unknown,
): TravelDecisionProblem[] {
  if (!metadata || typeof metadata !== 'object') return [];
  const raw = (metadata as Record<string, unknown>)[
    TRAVEL_DECISION_OPEN_META_KEY
  ] as TravelDecisionOpenProblemsMeta | undefined;
  if (!raw?.byId) return [];
  return Object.values(raw.byId).filter(
    (p) => p && p.state !== 'COMMITTED' && p.state !== 'CANCELLED',
  );
}

/** Commit 后建议用户生成草案的 route_and_run 消息 */
export function buildDraftBridgeMessage(problem: TravelDecisionProblem): string | null {
  const optionId = problem.selection?.optionId;
  if (!optionId) return null;
  const label =
    problem.options.find((o) => o.optionId === optionId)?.label_zh ?? optionId;

  switch (problem.decisionKey) {
    case 'TRIP_SCOPE':
      return `【请使用行程规划模式】按已确认的路线策略「${label}」检查当前行程，生成必要的调整草案（不要静默写入）。`;
    case 'ACCOMMODATION_MOVEMENT':
      return `【请使用行程规划模式】按住宿策略「${label}」调整相关天数，生成 Before/After 草案（不要静默写入）。`;
    case 'VEHICLE_ROAD_FIT':
      if (optionId === '2WD') {
        return `【请使用行程规划模式】已选两驱：检查并生成去掉仅四驱/F-road 路段的调整草案（不要静默写入）。`;
      }
      return null;
    case 'GLACIER_HIKE':
      if (optionId === 'JOIN') {
        return `【请使用行程规划模式】在合适日期加入冰川徒步候选，生成调整草案（不要静默写入）。`;
      }
      if (optionId === 'SKIP') {
        return `【请使用行程规划模式】去掉或替换冰川徒步相关安排，生成调整草案（不要静默写入）。`;
      }
      return null;
    case 'DAILY_PACE':
    case 'ARRIVAL_DAY_LOAD':
    case 'WINTER_ROUTE_RISK':
      return `【请使用行程规划模式】按已确认策略「${label}」生成行程调整草案（不要静默写入）。`;
    case 'LIVE_CONTINUE_OR_ABORT':
      return `【请使用行程规划模式】按今日执行选择「${label}」生成今日调整草案（不要静默写入）。`;
    default:
      return problem.downstreamDraftHint_zh
        ? `【请使用行程规划模式】按已确认决策「${label}」生成调整草案（不要静默写入）。`
        : null;
  }
}
