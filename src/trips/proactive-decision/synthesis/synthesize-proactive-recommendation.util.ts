/**
 * PD-5 — Deterministic CGUS-shaped ranking for Proactive Decision candidates.
 * Full CGUSSearchService may be injected later via {@link ProactiveCgusRankPort}.
 */

import type { ProactiveDecisionCaseId } from '../contracts/proactive-decision-case.types';
import type { LensActivationDecisionV1 } from '../lenses/lens-activation.types';
import {
  assertHardGateNotOverridden,
  isRecommendationAllowedUnderHardGate,
} from '../lenses/assert-hard-gate-invariant.util';
import type { HardGateVerdict } from '../lenses/lens-activation.types';
import { buildDefaultProactiveCandidates } from './build-default-proactive-candidates.util';
import {
  PROACTIVE_SYNTHESIS_SCHEMA_ID,
  type ProactiveSynthesisCandidateV1,
  type ProactiveSynthesisV1,
} from './proactive-synthesis.types';

export type ProactiveCgusRankPort = {
  /**
   * Optional hook to CGUSSearchService — when provided and enabled,
   * adapters may re-rank candidates that carry RoutePlanDraft.
   * V1 deterministic path does not require this.
   */
  engine: 'CGUS_SEARCH';
};

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Utility ≈ experience × (1 - risk) × feasibility × (optional repair)
 * Hard-infeasible candidates sink.
 */
export function scoreProactiveCandidate(
  c: ProactiveSynthesisCandidateV1,
): number {
  if (!c.feasible) return -1;
  const s = c.scores;
  const feasibility = clamp01(s.feasibility ?? 0.5);
  const risk = clamp01(s.risk ?? 0.5);
  const experience = clamp01(s.experienceScore ?? s.utility ?? 0.5);
  const repair = s.repairQuality != null ? clamp01(s.repairQuality) : 1;
  const loadPenalty = 1 - 0.25 * clamp01(s.loadScore ?? 0);
  return feasibility * (1 - risk) * experience * repair * loadPenalty;
}

export function rankProactiveCandidates(
  candidates: ProactiveSynthesisCandidateV1[],
): ProactiveSynthesisCandidateV1[] {
  return [...candidates]
    .map((c) => ({ ...c, utility: scoreProactiveCandidate(c) }))
    .sort((a, b) => (b.utility ?? 0) - (a.utility ?? 0));
}

export type SynthesizeProactiveRecommendationInput = {
  caseId: ProactiveDecisionCaseId;
  lens: LensActivationDecisionV1;
  hardBlocked?: boolean;
  /** Override default stub candidates (e.g. Neptune repair outputs) */
  candidates?: ProactiveSynthesisCandidateV1[];
  impactZh?: string;
  rankingEngine?: ProactiveSynthesisV1['rankingEngine'];
};

export type SynthesizeProactiveRecommendationResult =
  | { ok: true; synthesis: ProactiveSynthesisV1 }
  | {
      ok: false;
      reason: 'HARD_GATE_BLOCKED' | 'NO_FEASIBLE_CANDIDATE';
      abuVerdict: HardGateVerdict;
    };

/**
 * CGUS product entry for PD V1: rank lens candidates → Recommended + L3.
 * Verify/Hard Gate runs after ranking (PD-5.3).
 */
export function synthesizeProactiveRecommendation(
  input: SynthesizeProactiveRecommendationInput,
): SynthesizeProactiveRecommendationResult {
  const abuVerdict: HardGateVerdict = input.hardBlocked
    ? 'HARD_BLOCK'
    : 'ALLOW';

  const raw =
    input.candidates ??
    buildDefaultProactiveCandidates({
      caseId: input.caseId,
      lens: input.lens,
      hardBlocked: input.hardBlocked,
    });

  const ranked = rankProactiveCandidates(raw);
  const recommended = ranked.find((c) => c.feasible) ?? null;

  if (!recommended) {
    return { ok: false, reason: 'NO_FEASIBLE_CANDIDATE', abuVerdict };
  }

  // PD-5.3 — Hard Gate after synthesis: cannot recommend overriding HARD_BLOCK
  // via KEEP_ORIGINAL when Abu blocked.
  const overridesHardBlock =
    abuVerdict === 'HARD_BLOCK' &&
    recommended.optionId === 'OPT_KEEP_ORIGINAL';

  if (
    !isRecommendationAllowedUnderHardGate({
      abuVerdict,
      recommendationOverridesHardBlock: overridesHardBlock,
    })
  ) {
    // Prefer next feasible non-keep option
    const fallback = ranked.find(
      (c) => c.feasible && c.optionId !== 'OPT_KEEP_ORIGINAL',
    );
    if (!fallback) {
      return { ok: false, reason: 'HARD_GATE_BLOCKED', abuVerdict };
    }
    return {
      ok: true,
      synthesis: buildSynthesis({
        caseId: input.caseId,
        lens: input.lens,
        ranked,
        recommended: fallback,
        abuVerdict,
        impactZh: input.impactZh,
        rankingEngine: input.rankingEngine ?? 'DETERMINISTIC_CGUS_SHAPED',
      }),
    };
  }

  assertHardGateNotOverridden({
    abuVerdict,
    recommendationOverridesHardBlock: false,
  });

  return {
    ok: true,
    synthesis: buildSynthesis({
      caseId: input.caseId,
      lens: input.lens,
      ranked,
      recommended,
      abuVerdict,
      impactZh: input.impactZh,
      rankingEngine: input.rankingEngine ?? 'DETERMINISTIC_CGUS_SHAPED',
    }),
  };
}

function buildSynthesis(input: {
  caseId: ProactiveDecisionCaseId;
  lens: LensActivationDecisionV1;
  ranked: ProactiveSynthesisCandidateV1[];
  recommended: ProactiveSynthesisCandidateV1;
  abuVerdict: HardGateVerdict;
  impactZh?: string;
  rankingEngine: ProactiveSynthesisV1['rankingEngine'];
}): ProactiveSynthesisV1 {
  const confidence = clamp01(
    (input.recommended.utility ?? 0.5) *
      (input.recommended.scores.feasibility ?? 0.5),
  );
  /** Decision Improvement — V1 maps to recommended option utility (0..1) */
  const improvement = clamp01(input.recommended.utility ?? 0.5);
  const actionability = input.lens.activateNeptune ? 0.85 : 0.7;

  const reasonZh = [
    `综合 ${input.lens.lensOrder.join(' → ')} 评估`,
    input.recommended.summaryZh,
    ...(input.lens.rationaleZh.slice(0, 2) ?? []),
  ].join('；');

  return {
    schemaId: PROACTIVE_SYNTHESIS_SCHEMA_ID,
    version: 1,
    caseId: input.caseId,
    lensActivated: input.lens.lensOrder,
    recommended: {
      optionId: input.recommended.optionId,
      titleZh: input.recommended.titleZh,
      summaryZh: input.recommended.summaryZh,
      benefitsZh: input.recommended.benefitsZh,
    },
    confidence,
    reasonZh,
    impactZh:
      input.impactZh ??
      '该调整旨在降低执行风险并尽量保留核心体验。',
    rankedOptions: input.ranked,
    improvement: Math.max(improvement, 0.05),
    actionability,
    surfaceL3: {
      suggestionZh: `建议：${input.recommended.titleZh}`,
      benefitsZh: input.recommended.benefitsZh,
    },
    hardGate: {
      abuVerdict: input.abuVerdict,
      passed: true,
    },
    rankingEngine: input.rankingEngine,
  };
}
