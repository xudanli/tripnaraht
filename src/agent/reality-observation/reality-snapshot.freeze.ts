/**
 * 冻结 Reality Snapshot（兼容 tripnara/decision-reality-snapshot@v1）。
 * Gate / decisionSnapshot 只含 Canonical；隐式假设不写入 observedFacts。
 */

import type { RealitySnapshot as DecisionRealitySnapshotV1 } from '../../decision/kernel/decision-cognition.types';
import {
  detectObservationConflicts,
} from './conflict-detection.rules';
import type { ObservationExecutionState } from './observation-executor';
import { mineLatentHypothesesFromSignals } from './latent-mining.rules';
import {
  formatAskClarificationMessage,
  selectAskCards,
} from './reflect-ask-prompt.util';
import type {
  ObservationPlan,
  RorRealitySnapshot,
} from './reality-observation.types';

function nowIso(): string {
  return new Date().toISOString();
}

function pickValue(
  state: ObservationExecutionState,
  key: string,
): unknown {
  const o = state.observedFacts.find((f) => f.key === key);
  if (o) return o.value;
  const d = state.derivedFacts.find((f) => f.key === key);
  return d?.value;
}

/**
 * v1 投影：仅 Canonical（observed + derived）。禁止把 latent 写进 tripState/worldState。
 */
export function projectDecisionRealitySnapshotV1(
  state: ObservationExecutionState,
  plan: ObservationPlan,
  opts: { snapshotId: string; confidence: number },
): DecisionRealitySnapshotV1 {
  const itinerary = pickValue(state, 'targetDay.activities');
  const vehicle = pickValue(state, 'vehicle.profile') ?? pickValue(state, 'vehicle.driveType');
  const members =
    pickValue(state, 'participants') ?? pickValue(state, 'team.memberCapability');
  const bookings = pickValue(state, 'booking.fixedCommitments');
  const weather = pickValue(state, 'weather.forecast');
  const road =
    pickValue(state, 'road.segment.status') ?? pickValue(state, 'route.roadSegments');
  const route = pickValue(state, 'route.travelTimeMatrix');

  const unknowns = state.unknowns
    .filter((u) => u.blocking === true)
    .map((u) => ({
      id: u.key,
      question: u.question,
      blocking: u.blocking,
    }));

  const evidence = [
    ...state.observedFacts.map((f) => ({
      id: f.evidenceRef ?? f.key,
      kind: 'observed_fact',
      source: f.source.provider,
      detail: f.key,
    })),
    ...state.derivedFacts.map((f) => ({
      id: `derived:${f.key}`,
      kind: 'derived_fact',
      source: f.method,
      detail: f.key,
    })),
  ];

  const detected = detectObservationConflicts({
    state,
    message: plan.scope.message,
  });
  const conflicts = detected.map((c) => ({
    id: c.id,
    code: c.code,
    summary: c.summary,
    severity: c.severity,
    evidenceRefs: c.evidenceRefs,
  }));

  const driveMin = pickValue(state, 'derived.day.totalDrivingMinutes');
  const density = pickValue(state, 'derived.day.scheduleDensity');
  const hardN = conflicts.filter((c) => c.severity === 'HARD').length;
  const currentState = [
    pickValue(state, 'trip.destination') != null ? `目的地已识别` : '目的地未明',
    vehicle != null ? `车辆已观察` : '车辆未知',
    typeof driveMin === 'number' ? `驾驶约${Math.round(driveMin)}分钟` : null,
    density != null ? `密度${String(density)}` : null,
    hardN > 0 ? `${hardN}项硬冲突` : conflicts.length > 0 ? `${conflicts.length}项冲突` : '无冲突',
    unknowns.length > 0 ? `${unknowns.length}项阻塞未知` : null,
  ]
    .filter(Boolean)
    .join('；');

  return {
    schema: 'tripnara/decision-reality-snapshot@v1',
    snapshotId: opts.snapshotId,
    builtAt: nowIso(),
    tripState: {
      destination: pickValue(state, 'trip.destination'),
      itinerary,
      vehicle,
      members,
      bookings,
      planVersion: plan.scope.planVersion ?? undefined,
    },
    worldState: {
      weather,
      roadStatus: road,
      route,
      physical: {
        daylight: pickValue(state, 'environment.daylightWindow'),
        scheduleDensity: pickValue(state, 'derived.day.scheduleDensity'),
        totalDrivingMinutes: pickValue(state, 'derived.day.totalDrivingMinutes'),
        totalActivityMinutes: pickValue(state, 'derived.day.totalActivityMinutes'),
        bufferMinutes: pickValue(state, 'derived.day.bufferMinutes'),
      },
      human: members,
    },
    evidence,
    unknowns,
    conflicts,
    currentState,
    freshness: {
      status: state.observedFacts.length > 0 || state.derivedFacts.length > 0 ? 'VALID' : 'DEGRADED',
      reasons:
        state.observedFacts.length > 0 || state.derivedFacts.length > 0
          ? undefined
          : ['sparse_observed_facts'],
    },
    confidence: opts.confidence,
  };
}

export function freezeRealitySnapshot(input: {
  plan: ObservationPlan;
  state: ObservationExecutionState;
  message: string;
  includeLatent?: boolean;
}): RorRealitySnapshot {
  const { plan, state, message } = input;
  const at = nowIso();
  const snapshotId = `reality_${plan.operation}_${Date.now()}`;
  const observationId = `obs_${plan.operation}_${Date.now()}`;

  const askBlocking = state.unknowns.filter((u) => u.mustAskUser && u.blocking);
  const reflection = state.lastReflection;
  const nextActionAfterFreeze =
    reflection?.nextAction === 'ASK_USER' || askBlocking.length > 0
      ? 'ASK_USER'
      : reflection?.nextAction === 'ABORT'
        ? 'ABORT'
        : 'PROCEED_TO_GATE';

  const observedRequired = plan.needs
    .filter((n) => n.necessity === 'REQUIRED')
    .flatMap((n) => n.contextKeys);
  const covered = observedRequired.filter(
    (k) =>
      state.observedFacts.some((f) => f.key === k) ||
      state.derivedFacts.some((d) => d.key === k) ||
      state.unknowns.some((u) => u.key === k && u.gapKind === 'FETCH'),
  );
  const confidence = Math.max(
    0.2,
    Math.min(
      0.98,
      observedRequired.length === 0
        ? 0.7
        : covered.length / Math.max(1, observedRequired.length),
    ),
  );

  const latentHypotheses =
    input.includeLatent === false
      ? []
      : mineLatentHypothesesFromSignals({ message, state });

  const decisionSnapshot = projectDecisionRealitySnapshotV1(state, plan, {
    snapshotId,
    confidence,
  });

  const askCards =
    nextActionAfterFreeze === 'ASK_USER'
      ? selectAskCards(state.unknowns, plan)
      : [];
  const clarificationMessage =
    askCards.length > 0
      ? formatAskClarificationMessage({
          operation: plan.operation,
          cards: askCards,
          labelZh: plan.labelZh,
        })
      : undefined;

  return {
    schema: 'tripnara/decision-reality-snapshot@v1',
    snapshotId,
    observationId,
    operation: plan.operation,
    builtAt: at,
    scope: plan.scope,
    observedFacts: state.observedFacts,
    derivedFacts: state.derivedFacts,
    latentHypotheses,
    canonicalWorldState: {
      observedFacts: state.observedFacts,
      derivedFacts: state.derivedFacts,
    },
    latentWorldState: {
      hypotheses: latentHypotheses,
    },
    unknowns: state.unknowns,
    evidence: decisionSnapshot.evidence,
    confidence,
    tripVersion: plan.scope.planVersion ?? undefined,
    freshness: decisionSnapshot.freshness,
    decisionSnapshot,
    reflectRoundsUsed: state.reflectRoundsUsed,
    nextActionAfterFreeze,
    ...(askCards.length ? { askCards } : {}),
    ...(clarificationMessage ? { clarificationMessage } : {}),
  };
}

export function serializeRorSnapshotForObservability(
  snap: RorRealitySnapshot,
): Record<string, unknown> {
  return {
    observationId: snap.observationId,
    snapshotId: snap.snapshotId,
    operation: snap.operation,
    scope: snap.scope,
    layers: {
      observedFactKeys: snap.canonicalWorldState.observedFacts.map((f) => f.key),
      derivedFactKeys: snap.canonicalWorldState.derivedFacts.map((f) => f.key),
      latentKeys: snap.latentWorldState.hypotheses.map((h) => ({
        key: h.key,
        usagePolicy: h.usagePolicy,
        status: h.status,
        confidence: h.confidence,
      })),
    },
    unknowns: snap.unknowns.map((u) => ({
      key: u.key,
      gapKind: u.gapKind,
      blocking: u.blocking,
      mustAskUser: u.mustAskUser,
      askPromptZh: u.askPromptZh,
      promotedFromFetch: u.promotedFromFetch,
    })),
    askCards: snap.askCards ?? [],
    clarificationMessage: snap.clarificationMessage,
    confidence: snap.confidence,
    nextActionAfterFreeze: snap.nextActionAfterFreeze,
    reflectRoundsUsed: snap.reflectRoundsUsed,
    decisionSnapshotCanonicalOnly: true,
  };
}
