/**
 * Travel Memory advisory → CGUS scoringHints 软影响 + Contribution 证明。
 *
 * 禁止写入 hardConstraints / Decision Contract / Self-drive。
 * used=true 仅当偏好序会改变 top1（可证明），否则保持 false。
 */

import { scoreCandidatePreferenceAgainstPolicy } from '../../trips/decision/optimization/apply-cgus-optimization-policy.util';
import type { CgusScoringHints } from '../../trips/decision/optimization/cgus-optimization-policy.types';
import type { CGUSCandidate } from '../../trips/decision/optimization/cgus-search.service';
import type {
  MemoryContributionItemV1,
  MemoryDecisionTraceV1,
} from '../runtime/memory-decision-trace.types';
import type { TravelMemoryDecisionHintV1 } from './selective-consume.util';

export type TravelMemoryCgusSoftMode = 'off' | 'shadow' | 'active';

export function resolveTravelMemoryCgusSoftMode(
  env: NodeJS.ProcessEnv = process.env,
): TravelMemoryCgusSoftMode {
  const raw = String(env.TRAVEL_MEMORY_CGUS_SOFT ?? '')
    .trim()
    .toLowerCase();
  if (raw === 'off' || raw === '0' || raw === 'false') return 'off';
  if (raw === 'shadow') return 'shadow';
  if (raw === 'active' || raw === '1' || raw === 'true') return 'active';
  // 未设置：有 hints 时由调用方按 consume 意图默认 active
  return 'active';
}

export function cloneScoringHints(hints: CgusScoringHints): CgusScoringHints {
  return { ...hints };
}

/**
 * 将 advisory hints 合并进 scoringHints（就地返回新对象）。
 */
export function mergeTravelMemoryHintsIntoScoringHints(
  baseline: CgusScoringHints,
  memoryHints: TravelMemoryDecisionHintV1[],
): {
  scoringHints: CgusScoringHints;
  applied: MemoryContributionItemV1[];
} {
  const scoringHints = cloneScoringHints(baseline);
  const applied: MemoryContributionItemV1[] = [];

  for (const h of memoryHints) {
    if (!h.advisoryOnly) continue;
    const conf = Math.max(0, Math.min(1, h.confidence));
    const weight = Number((conf * 0.5).toFixed(3));

    if (h.influence === 'PACE_CONSTRAINT' || h.influence === 'TRIP_OVERRIDE') {
      const v = String(h.value ?? '').toUpperCase();
      if (/RELAX|轻松|慢/.test(v) || v === 'RELAXED') {
        scoringHints.densityPreference = 'relaxed';
        scoringHints.fatigueSensitivity = Math.max(
          scoringHints.fatigueSensitivity ?? 0.45,
          0.55 + conf * 0.35,
        );
      } else if (/DENSE|密集|快|PACKED/.test(v)) {
        scoringHints.densityPreference = 'dense';
      }
      applied.push({
        id: h.memoryId,
        memoryId: h.memoryId,
        influence: h.influence,
        weight,
        confidence: conf,
      });
    } else if (h.influence === 'RISK_PREFERENCE' || h.influence === 'EPISODE_WARNING') {
      scoringHints.safetyBias = Math.max(
        scoringHints.safetyBias ?? 0.5,
        0.55 + conf * 0.4,
      );
      if (h.influence === 'EPISODE_WARNING') {
        scoringHints.fatigueSensitivity = Math.max(
          scoringHints.fatigueSensitivity ?? 0.45,
          0.6 + conf * 0.3,
        );
        scoringHints.densityPreference =
          scoringHints.densityPreference === 'dense'
            ? 'balanced'
            : scoringHints.densityPreference ?? 'relaxed';
      }
      applied.push({
        id: h.memoryId,
        memoryId: h.memoryId,
        influence: h.influence,
        weight,
        confidence: conf,
      });
    } else if (h.influence === 'MEMBER_CONSTRAINT') {
      scoringHints.hotelChangeSensitivity = Math.max(
        scoringHints.hotelChangeSensitivity ?? 0.35,
        0.5 + conf * 0.35,
      );
      applied.push({
        id: h.memoryId,
        memoryId: h.memoryId,
        influence: h.influence,
        weight,
        confidence: conf,
      });
    }
  }

  return { scoringHints, applied };
}

export type RankedCandidateForProof = {
  candidate: Pick<CGUSCandidate, 'id' | 'constraintViolations'> & {
    id: string;
  };
  utility?: number;
  expectedUtility?: number;
  finalScore?: number;
};

function compositeScore(
  row: RankedCandidateForProof,
  preference: number,
): number {
  const base =
    row.finalScore ??
    row.expectedUtility ??
    row.utility ??
    0;
  // preference 作为软扰动，幅度有限，避免淹没 EU
  return base + (preference - 0.5) * 0.2;
}

export type MemoryContributionProofResultV1 = {
  trace: MemoryDecisionTraceV1;
  /** 无 Memory soft 时的偏好序 top1 */
  withoutMemoryRecommendation: string | null;
  /** 有 Memory soft 时的偏好序 top1 */
  withMemoryRecommendation: string | null;
  rankingChanged: boolean;
};

/**
 * 在同一候选集上用 baseline vs memory scoringHints 重算偏好序；
 * top1 变化 → used=true。
 */
export function proveMemoryContributionFromPreference(input: {
  decisionId: string;
  ranked: RankedCandidateForProof[];
  baselineHints: CgusScoringHints;
  memoryHints: CgusScoringHints;
  applied: MemoryContributionItemV1[];
  softMode: TravelMemoryCgusSoftMode;
}): MemoryContributionProofResultV1 {
  const ranked = input.ranked.slice(0, 12);
  let baselineTop1: string | null = null;
  let memoryTop1: string | null = null;
  let bestBase = -Infinity;
  let bestMem = -Infinity;

  for (const row of ranked) {
    const cand = row.candidate as CGUSCandidate;
    const basePref = scoreCandidatePreferenceAgainstPolicy(
      cand,
      input.baselineHints,
    );
    const memPref = scoreCandidatePreferenceAgainstPolicy(
      cand,
      input.memoryHints,
    );
    const baseScore = compositeScore(row, basePref);
    const memScore = compositeScore(row, memPref);
    if (baseScore > bestBase) {
      bestBase = baseScore;
      baselineTop1 = cand.id;
    }
    if (memScore > bestMem) {
      bestMem = memScore;
      memoryTop1 = cand.id;
    }
  }

  const rankingChanged =
    !!baselineTop1 &&
    !!memoryTop1 &&
    baselineTop1 !== memoryTop1 &&
    input.applied.length > 0;

  // shadow：只观测，不宣称影响了线上推荐
  const used =
    input.softMode === 'active' && rankingChanged && input.applied.length > 0;

  return {
    withoutMemoryRecommendation: baselineTop1,
    withMemoryRecommendation: memoryTop1,
    rankingChanged,
    trace: {
      schemaId: 'tripnara.memory_decision_trace@v1',
      version: 1,
      decisionId: input.decisionId,
      contextSources: {
        world: true,
        booking: false,
        team: false,
        memory: input.applied.length > 0,
      },
      memoryContribution: {
        used,
        influence: used ? input.applied : [],
        memories: used ? input.applied : undefined,
      },
    },
  };
}

/** 从 DSO / metadata 读取 prepare 注入的 hints */
export function readTravelMemoryDecisionHintsFromState(state: {
  systemState?: {
    travelMemoryDecisionHints?: unknown;
    tripMetadata?: Record<string, unknown>;
  };
  contextPackage?: { metadata?: Record<string, unknown> };
}): TravelMemoryDecisionHintV1[] {
  const direct = state.systemState?.travelMemoryDecisionHints;
  if (Array.isArray(direct) && direct.length > 0) {
    return direct as TravelMemoryDecisionHintV1[];
  }
  const fromTripMeta = state.systemState?.tripMetadata?.travelMemoryDecisionHints;
  if (Array.isArray(fromTripMeta) && fromTripMeta.length > 0) {
    return fromTripMeta as TravelMemoryDecisionHintV1[];
  }
  const fromPkg = state.contextPackage?.metadata?.travelMemoryDecisionHints;
  if (Array.isArray(fromPkg) && fromPkg.length > 0) {
    return fromPkg as TravelMemoryDecisionHintV1[];
  }
  return [];
}
