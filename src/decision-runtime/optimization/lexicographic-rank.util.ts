/**
 * Lexicographic candidate ranking by objective tier (L2 → L3 → L4).
 * Lab v0 stand-in for CP-SAT lexicographic solver — same objective registry contract.
 */

import type { DecisionCandidate } from '../candidates/contracts/decision-candidate';
import type { CanonicalObjectiveId, ObjectiveSemantics } from '../contracts/objective-definition';
import { ObjectiveSemanticsRegistry } from '../objectives/objective-semantics.registry';

const TIER_ORDER = ['L2', 'L3', 'L4'] as const;

export interface LexicographicRankEntry {
  candidateId: string;
  tierScores: Record<string, number[]>;
  vector: number[];
}

export function rankCandidatesLexicographic(input: {
  candidates: DecisionCandidate[];
  enabledObjectives?: CanonicalObjectiveId[];
  registry?: ObjectiveSemanticsRegistry;
}): LexicographicRankEntry[] {
  const registry = input.registry ?? new ObjectiveSemanticsRegistry();
  const semantics = registry.list().filter((s) =>
    (input.enabledObjectives ?? registry.list().map((o) => o.objectiveId)).includes(
      s.objectiveId,
    ),
  );

  const byTier = groupByTier(semantics);

  const entries = input.candidates.map((candidate) => {
    const evaluations = registry.evaluatePlan({
      plan: candidate.plan,
      utilityHint: candidate.utilityHint,
      enabledObjectives: semantics.map((s) => s.objectiveId),
    });
    const evalById = new Map(evaluations.map((e) => [e.objectiveId, e.normalizedValue]));

    const tierScores: Record<string, number[]> = {};
    const vector: number[] = [];

    for (const tier of TIER_ORDER) {
      const objs = byTier.get(tier) ?? [];
      const scores = objs.map((o) => evalById.get(o.objectiveId) ?? 0);
      tierScores[tier] = scores;
      vector.push(...scores);
    }

    return { candidateId: candidate.candidateId, tierScores, vector };
  });

  return entries.sort((a, b) => compareLexVectors(a.vector, b.vector));
}

export function pickLexicographicWinner(
  ranked: LexicographicRankEntry[],
): string | undefined {
  return ranked[0]?.candidateId;
}

function groupByTier(
  semantics: ObjectiveSemantics[],
): Map<string, ObjectiveSemantics[]> {
  const map = new Map<string, ObjectiveSemantics[]>();
  for (const tier of TIER_ORDER) {
    map.set(
      tier,
      semantics.filter((s) => s.tier === tier),
    );
  }
  return map;
}

function compareLexVectors(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const diff = (b[i] ?? 0) - (a[i] ?? 0);
    if (Math.abs(diff) > 1e-9) return diff > 0 ? 1 : -1;
  }
  return 0;
}
