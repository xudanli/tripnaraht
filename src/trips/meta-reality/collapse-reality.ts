/**
 * Collapses the candidate lattice to a single provisional reality under selection physics.
 */

import { createHash } from 'crypto';
import type { RealitySeed, RealitySelectionPhysics } from './meta-reality-kernel.types';

function deterministicTriplet(seedId: string): { s: number; u: number; d: number } {
  const h = createHash('sha256').update(seedId, 'utf8').digest();
  const s = (h.readUInt32BE(0) % 10000) / 10000;
  const u = (h.readUInt32BE(4) % 10000) / 10000;
  const d = (h.readUInt32BE(8) % 10000) / 10000;
  return {
    s: 0.35 + s * 0.55,
    u: 0.3 + u * 0.65,
    d: d * 0.25,
  };
}

/** Attach deterministic observables when callers have not run sandbox scoring yet. */
export function enrichRealitySeedScores(seed: RealitySeed): RealitySeed {
  if (
    seed.stabilityScore != null &&
    seed.executionUtility != null &&
    seed.driftPenalty != null
  ) {
    return seed;
  }
  const { s, u, d } = deterministicTriplet(seed.seedId);
  return {
    ...seed,
    stabilityScore: seed.stabilityScore ?? s,
    executionUtility: seed.executionUtility ?? u,
    driftPenalty: seed.driftPenalty ?? d,
  };
}

export function realityCollapseScore(
  seed: RealitySeed,
  physics: RealitySelectionPhysics,
): number {
  const enriched = enrichRealitySeedScores(seed);
  const stab = enriched.stabilityScore ?? 0.5;
  const util = enriched.executionUtility ?? 0.5;
  const drift = enriched.driftPenalty ?? 0;
  const entropyPenalty = physics.entropyBias * (1 - stab);
  return (
    physics.stabilityWeight * stab + physics.utilityWeight * util - drift - entropyPenalty
  );
}

export function collapseReality(
  candidates: RealitySeed[],
  selectionPhysics: RealitySelectionPhysics,
): RealitySeed {
  if (!candidates.length) {
    throw new Error('[P21] collapseReality requires at least one candidate');
  }

  if (selectionPhysics.collapseMode === 'PROBABILISTIC') {
    const enriched = candidates.map(enrichRealitySeedScores);
    const scored = enriched.map(s => ({
      seed: s,
      score: realityCollapseScore(s, selectionPhysics),
    }));
    const max = Math.max(...scored.map(x => x.score));
    const pool = scored.filter(x => Math.abs(x.score - max) < 1e-9);
    const pick = pool[Math.floor(pool.length / 2)]!;
    return pick.seed;
  }

  const sorted = [...candidates]
    .map(enrichRealitySeedScores)
    .sort(
      (a, b) =>
        realityCollapseScore(b, selectionPhysics) - realityCollapseScore(a, selectionPhysics),
    );
  return sorted[0]!;
}

export function explainRealityCollapse(
  winner: RealitySeed,
  candidates: RealitySeed[],
  physics: RealitySelectionPhysics,
): string[] {
  const score = realityCollapseScore(winner, physics);
  const lines: string[] = [
    `Collapsed to reality seed "${winner.seedId}" (collapseScore=${score.toFixed(4)}, mode=${physics.collapseMode}).`,
    `Physics weights: stability=${physics.stabilityWeight}, utility=${physics.utilityWeight}, entropyBias=${physics.entropyBias}.`,
    `Winner causality=${winner.causalityPhysics}, time=${winner.timePhysics.type}, constraints=${winner.executionSemantics.constraints}.`,
  ];

  const others = candidates.filter(c => c.seedId !== winner.seedId).slice(0, 5);
  for (const o of others) {
    const gap = score - realityCollapseScore(enrichRealitySeedScores(o), physics);
    lines.push(`Not selected "${o.seedId}" (Δscore=${gap.toFixed(4)} vs winner).`);
  }

  return lines;
}
