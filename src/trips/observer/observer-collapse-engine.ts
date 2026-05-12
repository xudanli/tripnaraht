/**
 * Observer-conditioned collapse: score = utility·visibility − entropy·biasMultiplier(observers).
 */

import type { ExecutionObserver } from './observer.types';
import type { ObservableRealityCandidate, ObservedRealityOutcome } from './observable-reality.types';

function intersectionRatio(tags: string[] | undefined, focus: string[]): number {
  if (!focus.length) {
    return 1;
  }
  const t = new Set(tags ?? []);
  if (!t.size) {
    return 0.35;
  }
  let hit = 0;
  for (const f of focus) {
    if ([...t].some(x => x.includes(f) || f.includes(x))) {
      hit += 1;
    }
  }
  return hit / focus.length;
}

export function matchAttention(
  reality: ObservableRealityCandidate,
  focusDomains: string[],
): number {
  return intersectionRatio(reality.observedEventTags, focusDomains);
}

export function temporalAlignment(
  reality: ObservableRealityCandidate,
  temporalResolution: ExecutionObserver['attentionPolicy']['temporalResolution'],
): number {
  const tk = reality.timelineKind ?? 'WINDOWED';
  if (temporalResolution === 'REALTIME') {
    return tk === 'REALTIME' ? 1 : 0.82;
  }
  if (temporalResolution === 'WINDOWED') {
    return tk === 'WINDOWED' || tk === 'REALTIME' ? 1 : 0.78;
  }
  return tk === 'CROSS_DAY' ? 0.95 : 0.88;
}

export function spatialOverlap(
  reality: ObservableRealityCandidate,
  spatialResolution: ExecutionObserver['attentionPolicy']['spatialResolution'],
  focusDomains: string[],
): number {
  if (spatialResolution === 'GLOBAL') {
    return 1;
  }
  const g = reality.geoRegion ?? '';
  if (spatialResolution === 'REGIONAL') {
    return g && focusDomains.some(f => g.includes(f) || f.includes(g)) ? 1 : 0.72;
  }
  return g && focusDomains.some(f => g === f) ? 1 : 0.58;
}

export function computeVisibility(
  reality: ObservableRealityCandidate,
  observer: ExecutionObserver,
): number {
  const ap = observer.attentionPolicy;
  const vAttention = matchAttention(reality, ap.focusDomains);
  const vTime = temporalAlignment(reality, ap.temporalResolution);
  const vSpace = spatialOverlap(reality, ap.spatialResolution, ap.focusDomains);

  let samplingFactor = 1;
  switch (observer.samplingStrategy) {
    case 'FULL_TRACE':
      samplingFactor = 1;
      break;
    case 'SPARSE_TRACE':
      samplingFactor = 0.92;
      break;
    case 'EVENT_TRIGGERED':
      samplingFactor = 0.88;
      break;
    case 'GOAL_ORIENTED':
      samplingFactor = 0.95 + 0.05 * matchAttention(reality, ap.focusDomains);
      break;
    default:
      samplingFactor = 1;
  }

  return Math.min(1, vAttention * vTime * vSpace * samplingFactor);
}

export function applyObserverBias(reality: ObservableRealityCandidate, observer: ExecutionObserver): number {
  switch (observer.biasModel) {
    case 'RISK_AVOIDANT':
      return (reality.riskScore ?? 0.5) * 1.2;
    case 'OPPORTUNITY_SEEKING':
      return (reality.opportunityScore ?? 0.5) * 0.8;
    case 'NEUTRAL':
    default:
      return 1;
  }
}

function utilityOf(reality: ObservableRealityCandidate): number {
  return reality.executionUtility ?? 0.5;
}

function entropyOf(reality: ObservableRealityCandidate): number {
  if (typeof reality.entropy === 'number') {
    return Math.min(1, Math.max(0, reality.entropy));
  }
  return Math.min(1, 1 - (reality.probabilityWeight ?? 0));
}

export function observerCollapseScore(
  reality: ObservableRealityCandidate,
  observer: ExecutionObserver,
): { score: number; visibility: number; biasMultiplier: number } {
  const visibility = computeVisibility(reality, observer);
  const biasMultiplier = applyObserverBias(reality, observer);
  const u = utilityOf(reality);
  const ent = entropyOf(reality);
  const score = u * visibility - ent * biasMultiplier;
  return { score, visibility, biasMultiplier };
}

export function collapseRealityWithObserver(
  realities: ObservableRealityCandidate[],
  observer: ExecutionObserver,
): ObservedRealityOutcome {
  if (!realities.length) {
    throw new Error('[P22] collapseRealityWithObserver requires at least one reality');
  }

  const ranked = realities
    .map(r => {
      const { score, visibility, biasMultiplier } = observerCollapseScore(r, observer);
      return {
        ...r,
        collapseScore: score,
        visibility,
        biasMultiplier,
      };
    })
    .sort((a, b) => b.collapseScore - a.collapseScore);

  return ranked[0]!;
}

export function explainObservedReality(
  observer: ExecutionObserver,
  outcome: ObservedRealityOutcome,
  alternatives: ObservableRealityCandidate[],
): string[] {
  const lines: string[] = [
    `Observer ${observer.observerId} (${observer.samplingStrategy}, bias=${observer.biasModel}) collapsed to seed "${outcome.seedId}".`,
    `collapseScore=${outcome.collapseScore.toFixed(4)} visibility=${outcome.visibility.toFixed(4)} biasMultiplier=${outcome.biasMultiplier.toFixed(4)}.`,
    `Attention focus=[${observer.attentionPolicy.focusDomains.join(', ')}] temporal=${observer.attentionPolicy.temporalResolution} spatial=${observer.attentionPolicy.spatialResolution}.`,
  ];

  const alt = alternatives.filter(a => a.seedId !== outcome.seedId).slice(0, 4);
  for (const a of alt) {
    const { score } = observerCollapseScore(a, observer);
    lines.push(`Excluded "${a.seedId}" (observerScore=${score.toFixed(4)}).`);
  }

  return lines;
}
