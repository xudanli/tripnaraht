/**
 * Deterministic observer mutation from drift metrics + collapsed reality feedback.
 */

import type { ExecutionObserver } from '../observer/observer.types';
import type {
  ExtendedObserverBiasModel,
  ObserverDriftMetrics,
  ObserverMutationHistoryEntry,
  ObserverState,
  SelectedRealityFeedback,
} from './observer-rewrite-kernel.types';
import { computeObserverDrift } from './observer-drift';

function seedIdentity(observerId: string): number[] {
  let h = 0;
  for (let i = 0; i < observerId.length; i++) {
    h = (h * 31 + observerId.charCodeAt(i)) >>> 0;
  }
  const a = (h % 1000) / 1000;
  const b = ((h >> 8) % 1000) / 1000;
  const c = ((h >> 16) % 1000) / 1000;
  return [a, b, c];
}

export function reduceFocusDomains(domains: string[]): string[] {
  if (domains.length <= 1) {
    return domains;
  }
  const keep = Math.max(1, Math.floor(domains.length / 2));
  return domains.slice(0, keep);
}

export function adaptAttention(
  observer: ExecutionObserver,
  drift: ObserverDriftMetrics,
): ExecutionObserver['attentionPolicy'] {
  const ap = observer.attentionPolicy;

  if (drift.temporalMismatch > 0.3) {
    return {
      ...ap,
      temporalResolution: 'WINDOWED',
    };
  }

  if (drift.eventOverload) {
    return {
      ...ap,
      focusDomains: reduceFocusDomains(ap.focusDomains),
    };
  }

  return ap;
}

export function evolveBias(
  observer: ExecutionObserver,
  reality: SelectedRealityFeedback,
): ExtendedObserverBiasModel {
  if (reality.failureType === 'HIGH_RISK_OVERESTIMATION') {
    return 'RISK_NEUTRALIZED';
  }

  if (reality.successPattern === 'LOW_COST_HIGH_GAIN') {
    return 'OPPORTUNITY_AMPLIFIED';
  }

  return observer.biasModel;
}

export function updateIdentity(
  prior: number[],
  reality: SelectedRealityFeedback,
): number[] {
  const shift = reality.embeddingShift;
  if (!shift?.length) {
    return [...prior];
  }
  const out = prior.map((v, i) => v + (shift[i] ?? 0) * 0.1);
  return out;
}

export function recomputeStability(
  observer: ExecutionObserver,
  drift: ObserverDriftMetrics,
  priorResistance?: number,
): number {
  const base = priorResistance ?? 0.55;
  const bump = (1 - Math.min(1, drift.temporalMismatch)) * 0.15;
  return Math.min(1, Math.max(0.15, base * 0.98 + bump * 0.02));
}

export function mutateObserver(
  observer: ExecutionObserver,
  executionHistory: ObserverMutationHistoryEntry[],
  selectedReality: SelectedRealityFeedback,
  prior?: ObserverState,
): ObserverState {
  const drift = computeObserverDrift(executionHistory);

  const identityBase = prior?.identityVector ?? seedIdentity(observer.observerId);
  const identityVector = updateIdentity(identityBase, selectedReality);

  return {
    observerId: observer.observerId,
    attentionPolicy: adaptAttention(observer, drift),
    biasModel: evolveBias(observer, selectedReality),
    identityVector,
    driftResistance: recomputeStability(observer, drift, prior?.driftResistance),
    samplingStrategy: observer.samplingStrategy,
  };
}

/** Map evolved bias labels back to P22 collapse-compatible primitives when needed. */
export function collapseCompatibleBias(model: ExtendedObserverBiasModel): ExecutionObserver['biasModel'] {
  switch (model) {
    case 'RISK_NEUTRALIZED':
      return 'NEUTRAL';
    case 'OPPORTUNITY_AMPLIFIED':
      return 'OPPORTUNITY_SEEKING';
    default:
      return model;
  }
}

export function observerStateToExecutionObserver(state: ObserverState): ExecutionObserver {
  return {
    observerId: state.observerId,
    attentionPolicy: state.attentionPolicy,
    samplingStrategy: state.samplingStrategy,
    biasModel: collapseCompatibleBias(state.biasModel),
  };
}

export function explainObserverEvolution(
  before: ExecutionObserver,
  after: ObserverState,
): string[] {
  const lines: string[] = [
    `Observer ${after.observerId} driftResistance=${after.driftResistance.toFixed(3)} bias=${after.biasModel} temporal=${after.attentionPolicy.temporalResolution}`,
  ];

  if (before.biasModel !== after.biasModel) {
    lines.push(`Bias evolved: ${before.biasModel} → ${after.biasModel}`);
  }
  if (before.attentionPolicy.temporalResolution !== after.attentionPolicy.temporalResolution) {
    lines.push(
      `Attention temporalResolution: ${before.attentionPolicy.temporalResolution} → ${after.attentionPolicy.temporalResolution}`,
    );
  }
  if (before.attentionPolicy.focusDomains.length !== after.attentionPolicy.focusDomains.length) {
    lines.push(
      `Focus domains narrowed: ${before.attentionPolicy.focusDomains.length} → ${after.attentionPolicy.focusDomains.length}`,
    );
  }

  lines.push(`Identity vector (Δ magnitude)=${vectorDeltaMag(before, after).toFixed(4)}`);

  return lines;
}

function vectorDeltaMag(_before: ExecutionObserver, after: ObserverState): number {
  const id = after.identityVector;
  return Math.sqrt(id.reduce((s, x) => s + x * x, 0));
}
