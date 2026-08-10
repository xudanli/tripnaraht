/**
 * Observation Execution + Reflection（最多 2 轮）+ 三类缺口。
 */

import {
  detectObservationConflicts,
  formatConflictsForReflection,
  hasHardObservationConflict,
} from './conflict-detection.rules';
import {
  getObservationCapability,
} from './observation-capability.registry';
import { finalizeObservationAskLoop } from './reflect-ask-prompt.util';
import type {
  DerivedFact,
  ObservedFact,
  ObservationNeed,
  ObservationPlan,
  ObservationReflection,
  ObservationUnknown,
  RorFetchHost,
  RorSeedFacts,
} from './reality-observation.types';

export type ObservationExecutionState = {
  plan: ObservationPlan;
  observedFacts: ObservedFact[];
  derivedFacts: DerivedFact[];
  unknowns: ObservationUnknown[];
  reflectRoundsUsed: number;
  lastReflection: ObservationReflection | null;
};

function nowIso(): string {
  return new Date().toISOString();
}

function hasFact(facts: ObservedFact[], key: string): boolean {
  return facts.some((f) => f.key === key && f.value != null);
}

function classifyGapForKey(key: string, need: ObservationNeed): ObservationUnknown {
  const cap = getObservationCapability(key);
  const serviceKey = cap?.serviceKey;
  const canDerive = serviceKey === 'DERIVE';
  const mustAskUser = serviceKey === 'USER';
  const canFetch = !mustAskUser && !canDerive && serviceKey != null;
  const gapKind: ObservationUnknown['gapKind'] = mustAskUser
    ? 'ASK_USER'
    : canDerive
      ? 'DERIVE'
      : 'FETCH';
  return {
    key,
    question: need.question,
    gapKind,
    impact: need.blocking ? 'HIGH' : need.necessity === 'OPTIONAL' ? 'LOW' : 'MEDIUM',
    blocking: need.blocking === true && mustAskUser,
    canFetch,
    canDerive,
    mustAskUser,
  };
}

function deriveFromSeeds(
  key: string,
  seeds: RorSeedFacts,
  observed: ObservedFact[],
): DerivedFact | null {
  const at = nowIso();
  const activities = (seeds.byKey?.['targetDay.activities'] ??
    observed.find((f) => f.key === 'targetDay.activities')?.value) as
    | Array<{ durationMinutes?: number }>
    | undefined;
  const matrix = (seeds.byKey?.['route.travelTimeMatrix'] ??
    observed.find((f) => f.key === 'route.travelTimeMatrix')?.value) as
    | { totalMinutes?: number; legs?: Array<{ minutes?: number }> }
    | number
    | undefined;

  if (key === 'derived.day.totalActivityMinutes') {
    if (!Array.isArray(activities)) return null;
    const total = activities.reduce((s, a) => s + (Number(a.durationMinutes) || 0), 0);
    return {
      key,
      value: total,
      derivedFrom: ['targetDay.activities'],
      method: 'sum_activity_duration',
      observedAt: at,
      confidence: 0.95,
    };
  }
  if (key === 'derived.day.totalDrivingMinutes') {
    if (matrix == null) return null;
    const total =
      typeof matrix === 'number'
        ? matrix
        : typeof matrix.totalMinutes === 'number'
          ? matrix.totalMinutes
          : (matrix.legs ?? []).reduce((s, l) => s + (Number(l.minutes) || 0), 0);
    return {
      key,
      value: total,
      derivedFrom: ['route.travelTimeMatrix'],
      method: 'sum_travel_legs',
      observedAt: at,
      confidence: 0.9,
    };
  }
  if (key === 'derived.day.scheduleDensity') {
    const act =
      derivedLookup(observed, seeds, 'derived.day.totalActivityMinutes') ??
      (Array.isArray(activities)
        ? activities.reduce((s, a) => s + (Number(a.durationMinutes) || 0), 0)
        : null);
    const drive =
      derivedLookup(observed, seeds, 'derived.day.totalDrivingMinutes') ??
      (typeof matrix === 'number' ? matrix : matrix?.totalMinutes);
    if (act == null || drive == null) return null;
    const load = Number(act) + Number(drive);
    const density = load >= 480 ? 'HIGH' : load >= 360 ? 'MEDIUM' : 'LOW';
    return {
      key,
      value: density,
      derivedFrom: ['derived.day.totalActivityMinutes', 'derived.day.totalDrivingMinutes'],
      method: 'load_bucket',
      observedAt: at,
      confidence: 0.85,
    };
  }
  if (key === 'derived.day.bufferMinutes') {
    const act =
      derivedLookup(observed, seeds, 'derived.day.totalActivityMinutes') ??
      (Array.isArray(activities)
        ? activities.reduce((s, a) => s + (Number(a.durationMinutes) || 0), 0)
        : null);
    const drive =
      derivedLookup(observed, seeds, 'derived.day.totalDrivingMinutes') ??
      (typeof matrix === 'number' ? matrix : matrix?.totalMinutes);
    const daylight = seeds.byKey?.['environment.daylightWindow'] as
      | { daylightMinutes?: number }
      | number
      | undefined;
    const dayMin =
      typeof daylight === 'number'
        ? daylight
        : typeof daylight?.daylightMinutes === 'number'
          ? daylight.daylightMinutes
          : 720;
    if (act == null || drive == null) return null;
    return {
      key,
      value: Math.max(0, dayMin - Number(act) - Number(drive)),
      derivedFrom: [
        'derived.day.totalActivityMinutes',
        'derived.day.totalDrivingMinutes',
        'environment.daylightWindow',
      ],
      method: 'daylight_minus_load',
      observedAt: at,
      confidence: 0.8,
    };
  }
  return null;
}

function derivedLookup(
  observed: ObservedFact[],
  seeds: RorSeedFacts,
  key: string,
): number | null {
  const fromSeed = seeds.byKey?.[key];
  if (typeof fromSeed === 'number') return fromSeed;
  const f = observed.find((x) => x.key === key);
  return typeof f?.value === 'number' ? f.value : null;
}

/**
 * 执行一轮观察：种子 → 服务拉取 → 推导 → 登记缺口。
 */
export async function executeObservationRound(
  plan: ObservationPlan,
  state: ObservationExecutionState,
  seeds: RorSeedFacts,
  host?: RorFetchHost,
): Promise<ObservationExecutionState> {
  const observed = [...state.observedFacts];
  const derived = [...state.derivedFacts];
  const unknowns: ObservationUnknown[] = [];
  const at = nowIso();

  for (const need of plan.needs) {
    for (const key of need.contextKeys) {
      if (hasFact(observed, key) || derived.some((d) => d.key === key)) continue;

      const seedVal = seeds.byKey?.[key];
      if (seedVal != null) {
        const cap = getObservationCapability(key);
        if (cap?.serviceKey === 'DERIVE') {
          const d = deriveFromSeeds(key, seeds, observed);
          if (d) derived.push(d);
          continue;
        }
        observed.push({
          key,
          value: seedVal,
          scope: { ...(plan.scope as Record<string, unknown>) },
          source: {
            provider: 'SEED',
            authority: 'INTERNAL',
          },
          observedAt: at,
          confidence: 0.95,
          evidenceRef: `seed:${key}`,
        });
        continue;
      }

      const cap = getObservationCapability(key);
      if (!cap) continue;

      if (cap.serviceKey === 'DERIVE') {
        const d = deriveFromSeeds(key, seeds, observed);
        if (d) {
          derived.push(d);
        } else {
          unknowns.push(classifyGapForKey(key, need));
        }
        continue;
      }

      if (cap.serviceKey === 'USER') {
        unknowns.push(classifyGapForKey(key, need));
        continue;
      }

      let fetched: unknown | null = null;
      if (host?.fetchByServiceKey) {
        try {
          fetched = await host.fetchByServiceKey(cap.serviceKey, key, plan.scope);
        } catch {
          fetched = null;
        }
      }
      if (fetched != null) {
        observed.push({
          key,
          value: fetched,
          scope: { ...(plan.scope as Record<string, unknown>) },
          source: {
            provider: cap.serviceKey,
            authority: cap.serviceKey === 'ROAD' || cap.serviceKey === 'WEATHER' ? 'OFFICIAL' : 'INTERNAL',
          },
          observedAt: at,
          validUntil: cap.defaultFreshness
            ? new Date(Date.now() + 6 * 3600 * 1000).toISOString()
            : undefined,
          confidence: 0.9,
          evidenceRef: `${cap.serviceKey}:${key}`,
        });
      } else {
        unknowns.push(classifyGapForKey(key, need));
      }
    }
  }

  // 合并未知：同 key 去重，blocking ASK 优先
  const byKey = new Map<string, ObservationUnknown>();
  for (const u of [...state.unknowns, ...unknowns]) {
    const prev = byKey.get(u.key);
    if (!prev || (u.blocking && !prev.blocking) || (u.mustAskUser && !prev.mustAskUser)) {
      byKey.set(u.key, u);
    }
  }

  return {
    plan,
    observedFacts: observed,
    derivedFacts: derived,
    unknowns: [...byKey.values()],
    reflectRoundsUsed: state.reflectRoundsUsed,
    lastReflection: state.lastReflection,
  };
}

/**
 * 反思：是否足够看清；最多再 FETCH 一轮。
 * 硬冲突与 blocking ASK 同等优先，避免盲目 FREEZE。
 */
export function reflectObservation(
  state: ObservationExecutionState,
): ObservationReflection {
  const round = state.reflectRoundsUsed;
  const missingNeeds: ObservationNeed[] = [];
  const blockingAsk: string[] = [];
  const conflicts = detectObservationConflicts({
    state,
    message: state.plan.scope.message,
  });
  const conflictingFacts = formatConflictsForReflection(conflicts);
  const hardConflict = hasHardObservationConflict(conflicts);

  for (const need of state.plan.needs) {
    const unresolved = need.contextKeys.filter((k) => {
      if (state.observedFacts.some((f) => f.key === k)) return false;
      if (state.derivedFacts.some((d) => d.key === k)) return false;
      return true;
    });
    if (unresolved.length === 0) continue;

    const askBlocking = unresolved.some((k) => {
      const u = state.unknowns.find((x) => x.key === k);
      return u?.mustAskUser && need.blocking;
    });
    if (askBlocking) {
      blockingAsk.push(...unresolved);
    }

    const fetchableRequired = unresolved.some((k) => {
      const u = state.unknowns.find((x) => x.key === k);
      return u?.canFetch && need.necessity === 'REQUIRED';
    });

    if (need.necessity === 'REQUIRED' && (askBlocking || fetchableRequired)) {
      missingNeeds.push({
        ...need,
        contextKeys: unresolved,
      });
    }
  }

  if (blockingAsk.length > 0 || hardConflict) {
    return {
      sufficientlyObserved: false,
      missingFacts: missingNeeds,
      conflictingFacts,
      blockingUnknowns: [...new Set(blockingAsk)],
      nextAction: 'ASK_USER',
      round,
    };
  }

  const stillFetch = missingNeeds.some((n) =>
    n.contextKeys.some((k) => state.unknowns.find((u) => u.key === k)?.canFetch),
  );

  if (stillFetch && round < state.plan.maxReflectRounds) {
    return {
      sufficientlyObserved: false,
      missingFacts: missingNeeds,
      conflictingFacts,
      blockingUnknowns: [],
      nextAction: 'FETCH_MORE',
      round,
    };
  }

  return {
    sufficientlyObserved: true,
    missingFacts: missingNeeds.filter((n) => n.blocking),
    conflictingFacts,
    blockingUnknowns: [],
    nextAction: 'FREEZE_SNAPSHOT',
    round,
  };
}

/**
 * Plan → Execute → Reflect 循环（≤2 轮 Reflect / 共最多 3 次 execute）。
 */
export async function runObservationLoop(
  plan: ObservationPlan,
  seeds: RorSeedFacts = {},
  host?: RorFetchHost,
): Promise<ObservationExecutionState> {
  let state: ObservationExecutionState = {
    plan,
    observedFacts: [],
    derivedFacts: [],
    unknowns: [],
    reflectRoundsUsed: 0,
    lastReflection: null,
  };

  state = await executeObservationRound(plan, state, seeds, host);
  let reflection = reflectObservation(state);
  state = { ...state, lastReflection: reflection };

  while (
    reflection.nextAction === 'FETCH_MORE' &&
    state.reflectRoundsUsed < plan.maxReflectRounds
  ) {
    state = {
      ...state,
      reflectRoundsUsed: state.reflectRoundsUsed + 1,
    };
    // 缩小 needs 到 missing
    const focused: ObservationPlan = {
      ...plan,
      needs: reflection.missingFacts.length ? reflection.missingFacts : plan.needs,
    };
    state = await executeObservationRound(focused, state, seeds, host);
    reflection = reflectObservation(state);
    state = { ...state, lastReflection: reflection };
  }

  return finalizeObservationAskLoop(state, {
    message: plan.scope.message,
  });
}
