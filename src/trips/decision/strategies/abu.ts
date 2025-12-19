// src/trips/decision/strategies/abu.ts

/**
 * Abu Strategy: Risk-based Prioritization
 * 
 * 目标：当时间/体力/预算不够时，不是"平均砍"，而是保核心体验，砍边角，且可解释。
 */

import { ActivityCandidate, TripWorldState } from '../world-model';

export interface AbuPickResult {
  kept: ActivityCandidate[];
  dropped: ActivityCandidate[];
  reasonsById: Record<string, string[]>;
}

/**
 * Abu: choose what to keep under constraints (time/budget/energy).
 * MVP: greedy by marginal value; later you can use knapsack variants.
 */
export function abuSelectCoreActivities(
  state: TripWorldState,
  date: string,
  candidates: ActivityCandidate[],
  limits: { maxActiveMin: number; maxCost?: number },
): AbuPickResult {
  const reasonsById: Record<string, string[]> = {};

  const addReason = (id: string, r: string) => {
    reasonsById[id] = reasonsById[id] || [];
    reasonsById[id].push(r);
  };

  // 1) hard keep: mustSee / booked / fixed events mapping (you can plug in)
  const hardKeep = candidates.filter(c => c.mustSee);
  const soft = candidates.filter(c => !c.mustSee);

  // 2) score function (simple but explainable)
  const score = (c: ActivityCandidate) => {
    const intentScore = (c.intentTags || []).reduce(
      (sum, t) => sum + (state.context.preferences.intents[t] || 0),
      0
    );
    const quality = c.qualityScore ?? 0.5;
    const unique = c.uniquenessScore ?? 0.3;

    const weatherPenalty = (c.weatherSensitivity ?? 0) * 0.15;
    const riskPenalty =
      c.riskLevel === 'high' && state.context.preferences.riskTolerance === 'low'
        ? 0.6
        : 0;

    const costPenalty = c.cost
      ? Math.min(0.6, c.cost.amount / 5000)
      : 0; // heuristic

    return (
      1.2 * intentScore +
      0.8 * quality +
      0.5 * unique -
      weatherPenalty -
      riskPenalty -
      costPenalty
    );
  };

  // 3) enforce alternativeGroup: keep max 1
  const usedAltGroup = new Set<string>();
  const kept: ActivityCandidate[] = [];
  const dropped: ActivityCandidate[] = [];

  // keep hard first
  let usedMin = 0;
  let usedCost = 0;

  const tryKeep = (c: ActivityCandidate, reason: string) => {
    const alt = c.alternativeGroupId;
    if (alt && usedAltGroup.has(alt)) {
      dropped.push(c);
      addReason(c.id, `Dropped due to alternativeGroup conflict: ${alt}`);
      return;
    }
    const nextMin = usedMin + c.durationMin;
    const nextCost = usedCost + (c.cost?.amount || 0);

    if (nextMin > limits.maxActiveMin) {
      dropped.push(c);
      addReason(c.id, `Dropped: time budget exceeded`);
      return;
    }
    if (limits.maxCost != null && nextCost > limits.maxCost) {
      dropped.push(c);
      addReason(c.id, `Dropped: cost budget exceeded`);
      return;
    }

    kept.push(c);
    usedMin = nextMin;
    usedCost = nextCost;
    if (alt) usedAltGroup.add(alt);
    addReason(c.id, reason);
  };

  for (const c of hardKeep) tryKeep(c, 'Kept: mustSee');

  // greedy for remaining
  const sorted = soft.slice().sort((a, b) => score(b) - score(a));

  for (const c of sorted) {
    tryKeep(
      c,
      `Kept: high marginal value score=${score(c).toFixed(2)}`
    );
  }

  // any not in kept are dropped (ensure)
  const keptIds = new Set(kept.map(k => k.id));
  for (const c of candidates) {
    if (!keptIds.has(c.id) && !dropped.find(d => d.id === c.id)) {
      dropped.push(c);
      addReason(c.id, 'Dropped: not selected');
    }
  }

  return { kept, dropped, reasonsById };
}

