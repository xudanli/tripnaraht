/**
 * resolveEffectiveTravelerContext — L1 + L2 (+ L0/request) → EffectiveTravelerContext。
 *
 * M1 Shadow：纯函数投影，不写库、不改 DecisionParams / CGUS。
 */

import type { AgentMemoryContext } from '../../agent/memory/interfaces/agent-memory-context.interface';
import type { AssembledTravelContextV1 } from '../context-assembly/assembled-context.types';
import type { TravelMemoryDecisionHintV1 } from '../context-assembly/selective-consume.util';
import type { MemoryFieldView } from '../types/memory-event.types';
import type { TripMemoryView, UserProfileMemoryView } from '../types/memory-context-package.types';
import {
  EFFECTIVE_TRAVELER_CONTEXT_DESIGN_PRINCIPLE,
  type EffectiveMemoryItemV1,
  type EffectiveMemoryLayer,
  type EffectiveMemoryOverridePolicy,
  type EffectiveMemorySensitivity,
  type EffectiveTravelerContextObservabilityV1,
  type EffectiveTravelerContextV1,
  type TravelerMemoryDomain,
  type TravelerMemorySemanticType,
} from './effective-traveler-context.types';
import { travelerMemoryObjectsToEffectiveItems } from '../traveler-memory/traveler-memory-to-effective.util';
import { deriveEffectiveMemoryAuthority } from './effective-memory-authority.util';

export type ResolveEffectiveTravelerContextInput = {
  memory: AgentMemoryContext;
  assembledTravelContext?: AssembledTravelContextV1 | null;
  decisionHints?: TravelMemoryDecisionHintV1[] | null;
  now?: Date;
};

function item(input: {
  domain: TravelerMemoryDomain;
  semanticType: TravelerMemorySemanticType;
  key: string;
  value: unknown;
  layer: EffectiveMemoryLayer;
  confidence: number;
  sourceRefs: string[];
  overridePolicy: EffectiveMemoryOverridePolicy;
  sensitivity?: EffectiveMemorySensitivity;
}): EffectiveMemoryItemV1 {
  return {
    domain: input.domain,
    semanticType: input.semanticType,
    key: input.key,
    value: input.value,
    layer: input.layer,
    sourceScope: input.layer,
    authority: deriveEffectiveMemoryAuthority(input.semanticType),
    confidence: Math.max(0, Math.min(1, input.confidence)),
    status: 'SHADOW_PROJECTED',
    sourceRefs: input.sourceRefs,
    overridePolicy: input.overridePolicy,
    sensitivity: input.sensitivity ?? 'NORMAL',
  };
}

function fromTmrField(
  field: MemoryFieldView | undefined,
  meta: {
    domain: TravelerMemoryDomain;
    semanticType: TravelerMemorySemanticType;
    key: string;
    layer: EffectiveMemoryLayer;
    overridePolicy: EffectiveMemoryOverridePolicy;
    sourcePrefix: string;
    sensitivity?: EffectiveMemorySensitivity;
  },
): EffectiveMemoryItemV1 | null {
  if (!field || field.status === 'CANDIDATE') return null;
  const conf =
    typeof field.confidence === 'number' && Number.isFinite(field.confidence)
      ? field.confidence
      : 0.5;
  return item({
    domain: meta.domain,
    semanticType: meta.semanticType,
    key: meta.key,
    value: field.value,
    layer: meta.layer,
    confidence: conf,
    sourceRefs: [
      `${meta.sourcePrefix}.${field.key}`,
      ...(field.evidenceEventIds ?? []).slice(0, 3).map((id) => `tmr.evidence:${id}`),
    ],
    overridePolicy: meta.overridePolicy,
    sensitivity: meta.sensitivity,
  });
}

function pushOsL1FromProfile(
  memory: AgentMemoryContext,
  out: EffectiveMemoryItemV1[],
): void {
  const profile = memory.userProfile;
  if (!profile) return;
  const conf = typeof profile.confidence === 'number' ? profile.confidence : 0.5;
  const baseRef = 'os.userTravelProfile';

  if (profile.pacePreference) {
    out.push(
      item({
        domain: 'PACE',
        semanticType: 'PREFERENCE',
        key: 'pace',
        value: profile.pacePreference,
        layer: 'L1_PERSISTENT',
        confidence: conf,
        sourceRefs: [`${baseRef}.pacePreference`],
        overridePolicy: 'L2_WINS',
      }),
    );
  }
  if (profile.riskTolerance) {
    out.push(
      item({
        domain: 'DECISION_STYLE',
        semanticType: 'PREFERENCE',
        key: 'risk_tolerance',
        value: profile.riskTolerance,
        layer: 'L1_PERSISTENT',
        confidence: conf,
        sourceRefs: [`${baseRef}.riskTolerance`],
        overridePolicy: 'L2_WINS',
      }),
    );
  }
  if (profile.travelPhilosophy) {
    out.push(
      item({
        domain: 'EXPERIENCE',
        semanticType: 'PREFERENCE',
        key: 'travel_philosophy',
        value: profile.travelPhilosophy,
        layer: 'L1_PERSISTENT',
        confidence: conf,
        sourceRefs: [`${baseRef}.travelPhilosophy`],
        overridePolicy: 'L2_WINS',
      }),
    );
  }
  if (profile.preferredRouteTypes?.length) {
    out.push(
      item({
        domain: 'EXPERIENCE',
        semanticType: 'PREFERENCE',
        key: 'preferred_route_types',
        value: [...profile.preferredRouteTypes],
        layer: 'L1_PERSISTENT',
        confidence: conf,
        sourceRefs: [`${baseRef}.preferredRouteTypes`],
        overridePolicy: 'L2_WINS',
      }),
    );
  }
  const sleep = profile.drivingFatiguePreferences?.sleepQuality;
  if (sleep) {
    out.push(
      item({
        domain: 'SLEEP',
        semanticType: 'HABIT',
        key: 'sleep_quality',
        value: sleep,
        layer: 'L1_PERSISTENT',
        confidence: conf,
        sourceRefs: [`${baseRef}.drivingFatiguePreferences.sleepQuality`],
        overridePolicy: 'L1_ONLY',
        sensitivity: 'SENSITIVE',
      }),
    );
  }
  const breakHabit = profile.drivingFatiguePreferences?.breakHabit;
  if (breakHabit) {
    out.push(
      item({
        domain: 'MOBILITY',
        semanticType: 'HABIT',
        key: 'driving_break_habit',
        value: breakHabit,
        layer: 'L1_PERSISTENT',
        confidence: conf,
        sourceRefs: [`${baseRef}.drivingFatiguePreferences.breakHabit`],
        overridePolicy: 'L2_WINS',
      }),
    );
  }
}

function pushOsL0Basics(
  memory: AgentMemoryContext,
  out: EffectiveMemoryItemV1[],
): void {
  const basics = memory.userBasics;
  if (!basics) return;
  if (basics.dietaryRestrictions?.length) {
    out.push(
      item({
        domain: 'FOOD',
        semanticType: 'CONSTRAINT',
        key: 'dietary_restrictions',
        value: [...basics.dietaryRestrictions],
        layer: 'L1_PERSISTENT',
        confidence: 0.9,
        sourceRefs: ['os.userBasics.dietaryRestrictions'],
        overridePolicy: 'L1_ONLY',
        sensitivity: 'SENSITIVE',
      }),
    );
  }
  if (basics.preferredAttractionTypes?.length) {
    out.push(
      item({
        domain: 'EXPERIENCE',
        semanticType: 'PREFERENCE',
        key: 'preferred_attraction_types',
        value: [...basics.preferredAttractionTypes],
        layer: 'L1_PERSISTENT',
        confidence: 0.75,
        sourceRefs: ['os.userBasics.preferredAttractionTypes'],
        overridePolicy: 'L2_WINS',
      }),
    );
  }
  if (basics.preferOffbeatAttractions === true) {
    out.push(
      item({
        domain: 'EXPERIENCE',
        semanticType: 'PREFERENCE',
        key: 'prefer_offbeat',
        value: true,
        layer: 'L1_PERSISTENT',
        confidence: 0.7,
        sourceRefs: ['os.userBasics.preferOffbeatAttractions'],
        overridePolicy: 'L2_WINS',
      }),
    );
  }
}

function pushRequestOverlays(
  memory: AgentMemoryContext,
  out: EffectiveMemoryItemV1[],
): void {
  const party = memory.routePartyProfile;
  if (!party) return;
  if (party.risk_tolerance) {
    out.push(
      item({
        domain: 'DECISION_STYLE',
        semanticType: 'PREFERENCE',
        key: 'risk_tolerance',
        value: party.risk_tolerance,
        layer: 'REQUEST_OVERLAY',
        confidence: 0.85,
        sourceRefs: ['os.routePartyProfile.risk_tolerance'],
        overridePolicy: 'REQUEST_EPHEMERAL',
      }),
    );
  }
  if (party.fitness_level) {
    out.push(
      item({
        domain: 'MOBILITY',
        semanticType: 'HABIT',
        key: 'fitness_level',
        value: party.fitness_level,
        layer: 'REQUEST_OVERLAY',
        confidence: 0.8,
        sourceRefs: ['os.routePartyProfile.fitness_level'],
        overridePolicy: 'REQUEST_EPHEMERAL',
      }),
    );
  }
  if (party.mobility_note_zh?.trim()) {
    out.push(
      item({
        domain: 'MOBILITY',
        semanticType: 'CONSTRAINT',
        key: 'mobility_note',
        value: party.mobility_note_zh.trim(),
        layer: 'REQUEST_OVERLAY',
        confidence: 0.85,
        sourceRefs: ['os.routePartyProfile.mobility_note_zh'],
        overridePolicy: 'REQUEST_EPHEMERAL',
        sensitivity: 'SENSITIVE',
      }),
    );
  }
}

function pushTmrStructured(
  structured: UserProfileMemoryView | undefined,
  out: EffectiveMemoryItemV1[],
): string[] {
  if (!structured) return [];
  const keys: string[] = [];
  const pace = fromTmrField(structured.pace, {
    domain: 'PACE',
    semanticType: 'PREFERENCE',
    key: 'pace',
    layer: 'L1_PERSISTENT',
    overridePolicy: 'L2_WINS',
    sourcePrefix: 'tmr.structured',
  });
  if (pace) {
    out.push(pace);
    keys.push('pace');
  }
  const risk = fromTmrField(structured.riskTolerance, {
    domain: 'DECISION_STYLE',
    semanticType: 'PREFERENCE',
    key: 'risk_tolerance',
    layer: 'L1_PERSISTENT',
    overridePolicy: 'L2_WINS',
    sourcePrefix: 'tmr.structured',
  });
  if (risk) {
    out.push(risk);
    keys.push('risk_tolerance');
  }
  const stay = fromTmrField(structured.accommodationMovement, {
    domain: 'STAY',
    semanticType: 'PREFERENCE',
    key: 'accommodation_movement',
    layer: 'L1_PERSISTENT',
    overridePolicy: 'L2_WINS',
    sourcePrefix: 'tmr.structured',
  });
  if (stay) {
    out.push(stay);
    keys.push('accommodation_movement');
  }
  const exp = fromTmrField(structured.preferredExperience, {
    domain: 'EXPERIENCE',
    semanticType: 'PREFERENCE',
    key: 'experience_preference',
    layer: 'L1_PERSISTENT',
    overridePolicy: 'L2_WINS',
    sourcePrefix: 'tmr.structured',
  });
  if (exp) {
    out.push(exp);
    keys.push('experience_preference');
  }
  const plan = fromTmrField(structured.planningStyle, {
    domain: 'DECISION_STYLE',
    semanticType: 'HABIT',
    key: 'planning_style',
    layer: 'L1_PERSISTENT',
    overridePolicy: 'L2_WINS',
    sourcePrefix: 'tmr.structured',
  });
  if (plan) {
    out.push(plan);
    keys.push('planning_style');
  }
  return keys;
}

function pushTmrTrip(
  trip: TripMemoryView | null | undefined,
  out: EffectiveMemoryItemV1[],
): string[] {
  if (!trip) return [];
  const keys: string[] = [];
  const pace = fromTmrField(trip.paceOverride, {
    domain: 'PACE',
    semanticType: 'PREFERENCE',
    key: 'pace',
    layer: 'L2_TRIP_OVERRIDE',
    overridePolicy: 'L2_WINS',
    sourcePrefix: 'tmr.trip',
  });
  if (pace) {
    out.push(pace);
    keys.push('pace');
  }
  const night = fromTmrField(trip.nightDriving, {
    domain: 'MOBILITY',
    semanticType: 'CONSTRAINT',
    key: 'night_driving',
    layer: 'L2_TRIP_OVERRIDE',
    overridePolicy: 'L2_WINS',
    sourcePrefix: 'tmr.trip',
  });
  if (night) {
    out.push(night);
    keys.push('night_driving');
  }
  const maxDrive = fromTmrField(trip.maxDailyDrivingMinutes, {
    domain: 'MOBILITY',
    semanticType: 'HABIT',
    key: 'max_daily_driving_minutes',
    layer: 'L2_TRIP_OVERRIDE',
    overridePolicy: 'L2_WINS',
    sourcePrefix: 'tmr.trip',
  });
  if (maxDrive) {
    out.push(maxDrive);
    keys.push('max_daily_driving_minutes');
  }
  const tmp = fromTmrField(trip.temporaryConstraints, {
    domain: 'PACE',
    semanticType: 'CONSTRAINT',
    key: 'temporary_constraints',
    layer: 'L2_TRIP_OVERRIDE',
    overridePolicy: 'L2_WINS',
    sourcePrefix: 'tmr.trip',
  });
  if (tmp) {
    out.push(tmp);
    keys.push('temporary_constraints');
  }
  return keys;
}

const LAYER_RANK: Record<EffectiveMemoryLayer, number> = {
  L1_PERSISTENT: 1,
  L0_WORKING: 2,
  REQUEST_OVERLAY: 3,
  L2_TRIP_OVERRIDE: 4,
};

function pickWinner(
  items: EffectiveMemoryItemV1[],
  key: string,
): EffectiveMemoryItemV1 | undefined {
  const matches = items.filter((i) => i.key === key);
  if (matches.length === 0) return undefined;
  return [...matches].sort((a, b) => {
    const lr = LAYER_RANK[b.layer] - LAYER_RANK[a.layer];
    if (lr !== 0) return lr;
    const aContract = a.sourceRefs.some((r) => r.startsWith('traveler_memory:'));
    const bContract = b.sourceRefs.some((r) => r.startsWith('traveler_memory:'));
    if (aContract !== bContract) return bContract ? 1 : -1;
    return b.confidence - a.confidence;
  })[0];
}

function markOverrides(items: EffectiveMemoryItemV1[]): string[] {
  const applied: string[] = [];
  const byKey = new Map<string, EffectiveMemoryItemV1[]>();
  for (const it of items) {
    const list = byKey.get(it.key) ?? [];
    list.push(it);
    byKey.set(it.key, list);
  }
  for (const [key, list] of byKey) {
    const winner = pickWinner(list, key);
    if (!winner || winner.layer !== 'L2_TRIP_OVERRIDE') continue;
    applied.push(key);
    for (const it of list) {
      if (it !== winner && it.layer === 'L1_PERSISTENT') {
        it.overriddenByKey = key;
      }
    }
  }
  return applied;
}

/**
 * 从旧 OS snapshot + 可选 TMR assembly 投影 EffectiveTravelerContext（Shadow）。
 */
export function resolveEffectiveTravelerContext(
  input: ResolveEffectiveTravelerContextInput,
): EffectiveTravelerContextV1 {
  const { memory } = input;
  const items: EffectiveMemoryItemV1[] = [];

  pushOsL1FromProfile(memory, items);
  pushOsL0Basics(memory, items);
  pushRequestOverlays(memory, items);

  const tmrPkg = input.assembledTravelContext?.memory ?? null;
  const tmrStructuredKeys = pushTmrStructured(tmrPkg?.structured, items);
  const tmrTripKeys = pushTmrTrip(tmrPkg?.tripMemory, items);

  // M4：Traveler Memory Contract 对象优先于同 key 的 OS/legacy 投影
  const contractItems = travelerMemoryObjectsToEffectiveItems(
    tmrPkg?.structured?.travelerMemories ?? [],
  );
  if (contractItems.length > 0) {
    items.push(...contractItems);
  }

  // M5：Trip Override（scope=TRIP）→ L2，压过 L1
  const tripOverrideItems = travelerMemoryObjectsToEffectiveItems(
    (tmrPkg?.tripMemory?.travelerOverrides ?? []).filter(
      (m) => m.key !== 'trip_memory_mode',
    ),
  );
  if (tripOverrideItems.length > 0) {
    items.push(...tripOverrideItems);
  }

  const tripOverridesApplied = markOverrides(items);

  const byDomain: EffectiveTravelerContextV1['byDomain'] = {};
  for (const it of items) {
    const list = byDomain[it.domain] ?? [];
    list.push(it);
    byDomain[it.domain] = list;
  }

  const travelPref = memory.travelPreference;
  const osTravelPreferenceKeys =
    travelPref && typeof travelPref === 'object'
      ? Object.keys(travelPref).sort()
      : [];

  const advisoryHints = [...(input.decisionHints ?? [])];

  return {
    schemaId: 'tripnara.effective_traveler_context@v1',
    version: 1,
    consumptionMode: 'SHADOW',
    subjectId: memory.userId,
    tripId: memory.tripId,
    resolvedAt: (input.now ?? new Date()).toISOString(),
    items,
    byDomain,
    effective: {
      pace: pickWinner(items, 'pace'),
      riskTolerance: pickWinner(items, 'risk_tolerance'),
      dietaryConstraints: pickWinner(items, 'dietary_restrictions'),
      experienceInterests:
        pickWinner(items, 'preferred_attraction_types') ??
        pickWinner(items, 'experience_preference') ??
        pickWinner(items, 'preferred_route_types'),
      accommodationMovement: pickWinner(items, 'accommodation_movement'),
      planningStyle: pickWinner(items, 'planning_style'),
      sleepQuality: pickWinner(items, 'sleep_quality'),
    },
    tripOverridesApplied,
    advisoryHints,
    provenance: {
      osProfilePresent: memory.userProfile != null,
      osBasicsPresent: memory.userBasics != null,
      osTravelPreferenceKeys,
      tmrStructuredKeys,
      tmrTripKeys,
      itemCount: items.length,
      domainCount: Object.keys(byDomain).length,
    },
    designPrinciple: EFFECTIVE_TRAVELER_CONTEXT_DESIGN_PRINCIPLE,
  };
}

export function effectiveTravelerContextToObservability(
  ctx: EffectiveTravelerContextV1,
  consumeMode?: 'off' | 'shadow' | 'active',
  softHintsAudit?: import('./effective-traveler-context.types').EtcSoftHintsAuditV1,
): EffectiveTravelerContextObservabilityV1 {
  const domains = Object.keys(ctx.byDomain) as TravelerMemoryDomain[];
  const effectiveKeys = Object.entries(ctx.effective)
    .filter(([, v]) => v != null)
    .map(([k]) => k)
    .sort();
  return {
    schemaId: 'tripnara.effective_traveler_context_obs@v1',
    version: 1,
    consumptionMode: ctx.consumptionMode,
    subjectId: ctx.subjectId,
    tripId: ctx.tripId,
    itemCount: ctx.provenance.itemCount,
    domainCount: ctx.provenance.domainCount,
    domains,
    tripOverridesApplied: [...ctx.tripOverridesApplied],
    effectiveKeys,
    advisoryHintCount: ctx.advisoryHints.length,
    provenance: ctx.provenance,
    ...(consumeMode ? { consumeMode } : {}),
    ...(softHintsAudit ? { softHintsAudit } : {}),
  };
}
