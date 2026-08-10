/**
 * Decision Policy Projector：
 * TravelDecisionContract + DecisionState hints → CGUSOptimizationPolicy 快照。
 *
 * 只投影已可靠字段；不做合同字段→权重硬映射。
 */

import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import {
  buildTravelDecisionContract,
  readStoredTravelDecisionContract,
} from '../../trip-constraint-solver/utils/travel-decision-contract.builder';
import type { TravelPrincipleKey } from '../../trip-constraint-solver/types/travel-decision-contract.types';
import {
  CGUS_OPTIMIZATION_POLICY_SCHEMA_ID,
  CGUS_OPTIMIZATION_POLICY_VERSION,
  type CGUSOptimizationPolicy,
  type CgusHardConstraintSpec,
  type CgusPolicySource,
  type CgusScoringHints,
  type CgusSoftIntensity,
  type CgusSoftObjectiveKind,
  type CgusSoftObjectiveSpec,
} from './cgus-optimization-policy.types';

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function intensityFromRank(rank: number, total: number): CgusSoftIntensity {
  if (total <= 0) return 'MEDIUM';
  const ratio = rank / Math.max(1, total - 1);
  if (ratio <= 0.34) return 'HIGH';
  if (ratio <= 0.67) return 'MEDIUM';
  return 'LOW';
}

function principleToSoftKind(p: string): CgusSoftObjectiveKind {
  switch (p) {
    case 'PACE':
      return 'PACE';
    case 'FEWER_HOTEL_CHANGES':
      return 'FEWER_HOTEL_CHANGES';
    case 'BUDGET':
      return 'BUDGET';
    case 'COVERAGE':
      return 'COVERAGE';
    case 'SAFETY':
      return 'SAFETY';
    case 'CORE_EXPERIENCE':
      return 'CORE_EXPERIENCE';
    case 'FLEXIBILITY':
      return 'FLEXIBILITY';
    case 'PHOTOGRAPHY':
      return 'PHOTOGRAPHY';
    case 'FAMILY_COMFORT':
      return 'FAMILY_COMFORT';
    default:
      return 'OTHER';
  }
}

function resolveVehicleAndFRoad(input: {
  metadata: Record<string, unknown>;
  userConstraints: Record<string, unknown>;
}): { vehicleType?: '2WD' | '4WD'; fRoadAllowed?: boolean } {
  const metaConstraints = asObj(input.metadata.constraints);
  const isd = asObj(input.metadata.icelandSelfDrive);
  const driving = asObj(isd.drivingSettings);
  const vehicle = asObj(driving.vehicle);
  const routePref = asObj(driving.routePreferences);

  const rawType =
    input.userConstraints.vehicle_type ??
    input.userConstraints.vehicleType ??
    metaConstraints.vehicle_type ??
    metaConstraints.vehicleType ??
    (vehicle.is4wd === false ? '2WD' : vehicle.is4wd === true ? '4WD' : undefined);

  let vehicleType: '2WD' | '4WD' | undefined;
  if (rawType != null) {
    const s = String(rawType).toUpperCase();
    if (s.includes('2WD') || s === 'SEDAN') vehicleType = '2WD';
    else if (s.includes('4WD') || s.includes('SUV')) vehicleType = '4WD';
  }

  let fRoadAllowed: boolean | undefined;
  if (typeof metaConstraints.fRoadAllowed === 'boolean') {
    fRoadAllowed = metaConstraints.fRoadAllowed;
  } else if (metaConstraints.excludeFRoad === true) {
    fRoadAllowed = false;
  } else if (routePref.fRoadPreference === 'avoid') {
    fRoadAllowed = false;
  } else if (vehicleType === '2WD') {
    fRoadAllowed = false;
  } else if (vehicleType === '4WD') {
    fRoadAllowed = true;
  }

  return { vehicleType, fRoadAllowed };
}

function resolveMaxDailyDriveHours(input: {
  metadata: Record<string, unknown>;
  userConstraints: Record<string, unknown>;
  state?: DecisionState;
}): number | undefined {
  const metaConstraints = asObj(input.metadata.constraints);
  const corridor = input.state?.environmentState?.routeCorridorWorld?.constraints;
  const candidates = [
    input.userConstraints.maxDailyDriveHours,
    metaConstraints.maxDailyDriveHours,
    corridor?.maxDailyDriveHours,
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

function resolveLockedActivityIds(metadata: Record<string, unknown>): string[] {
  const constraints = asObj(metadata.constraints);
  const mustPlaces = constraints.mustPlaces;
  const ids: string[] = [];
  if (Array.isArray(mustPlaces)) {
    for (const p of mustPlaces) {
      if (typeof p === 'string' && p.trim()) ids.push(p.trim());
      else if (p && typeof p === 'object') {
        const o = p as Record<string, unknown>;
        const id = String(o.placeId ?? o.place_id ?? o.id ?? '').trim();
        if (id) ids.push(id);
      }
    }
  }
  const latest = asObj(metadata.travelDecisionLatest);
  const locked = latest.locked_activity_ids ?? latest.lockedActivityIds;
  if (Array.isArray(locked)) {
    for (const x of locked) {
      if (typeof x === 'string' && x.trim()) ids.push(x.trim());
    }
  }
  return [...new Set(ids)];
}

function buildScoringHints(
  softObjectives: CgusSoftObjectiveSpec[],
  paceHint?: string,
): CgusScoringHints {
  const hints: CgusScoringHints = {
    densityPreference: 'balanced',
    fatigueSensitivity: 0.45,
    costSensitivity: 0.35,
    hotelChangeSensitivity: 0.35,
    coverageBias: 0.4,
    safetyBias: 0.5,
  };

  const bump = (intensity: CgusSoftIntensity) =>
    intensity === 'HIGH' ? 0.85 : intensity === 'MEDIUM' ? 0.6 : 0.35;

  for (const o of softObjectives) {
    const v = bump(o.intensity);
    switch (o.kind) {
      case 'PACE':
      case 'FAMILY_COMFORT':
        hints.fatigueSensitivity = Math.max(hints.fatigueSensitivity ?? 0, v);
        if (o.intensity === 'HIGH') hints.densityPreference = 'relaxed';
        break;
      case 'COVERAGE':
        hints.coverageBias = Math.max(hints.coverageBias ?? 0, v);
        if (o.intensity === 'HIGH') hints.densityPreference = 'dense';
        break;
      case 'BUDGET':
        hints.costSensitivity = Math.max(hints.costSensitivity ?? 0, v);
        break;
      case 'FEWER_HOTEL_CHANGES':
        hints.hotelChangeSensitivity = Math.max(hints.hotelChangeSensitivity ?? 0, v);
        break;
      case 'SAFETY':
        hints.safetyBias = Math.max(hints.safetyBias ?? 0, v);
        break;
      default:
        break;
    }
  }

  const pace = String(paceHint ?? '').toLowerCase();
  if (pace === 'easy' || pace === 'relaxed' || pace === 'light' || pace === 'eazy') {
    hints.densityPreference = 'relaxed';
    hints.fatigueSensitivity = Math.max(hints.fatigueSensitivity ?? 0, 0.75);
  } else if (pace === 'packed' || pace === 'dense' || pace === 'rich' || pace === 'push') {
    hints.densityPreference = 'dense';
    hints.coverageBias = Math.max(hints.coverageBias ?? 0, 0.7);
  }

  return hints;
}

export function projectCgusOptimizationPolicy(input: {
  tripId: string;
  constraintsVersion?: number;
  /** trip.metadata（含 travelDecisionContract / icelandSelfDrive） */
  metadata?: Record<string, unknown>;
  /** DecisionState：补充 userIntent / corridor 等运行时 hints */
  state?: DecisionState;
  projectedAt?: string;
}): CGUSOptimizationPolicy {
  const metadata = input.metadata ?? {};
  const stored = readStoredTravelDecisionContract(metadata);
  const userConstraints = asObj(input.state?.userIntent?.constraints);
  const pacing = asObj(
    (metadata.pacing as Record<string, unknown>) ??
      asObj(asObj(asObj(metadata.icelandSelfDrive).drivingSettings).routePreferences),
  );

  const contract = buildTravelDecisionContract({
    tripId: input.tripId,
    constraintsVersion:
      input.constraintsVersion ??
      (Number.isFinite(Number(metadata.constraintsVersion))
        ? Number(metadata.constraintsVersion)
        : 0),
    metadata,
    pacing,
    items: [],
    conflicts: [],
    conflictConstraintIds: new Set(),
  });

  const hardConstraints: CgusHardConstraintSpec[] = [];
  const softObjectives: CgusSoftObjectiveSpec[] = [];

  const { vehicleType, fRoadAllowed } = resolveVehicleAndFRoad({
    metadata,
    userConstraints,
  });
  if (vehicleType) {
    hardConstraints.push({
      id: `hard:vehicle_type:${vehicleType}`,
      kind: 'VEHICLE_TYPE',
      params: { vehicleType },
      source: stored ? 'contract+metadata.constraints' : 'metadata.constraints',
    });
  }
  if (fRoadAllowed === false) {
    hardConstraints.push({
      id: 'hard:f_road_forbidden',
      kind: 'F_ROAD_FORBIDDEN',
      params: { fRoadAllowed: false },
      source: 'icelandSelfDrive.routePreferences|constraints',
    });
  }

  const maxDailyDriveHours = resolveMaxDailyDriveHours({
    metadata,
    userConstraints,
    state: input.state,
  });
  if (maxDailyDriveHours != null) {
    hardConstraints.push({
      id: `hard:max_daily_drive:${maxDailyDriveHours}`,
      kind: 'MAX_DAILY_DRIVE_HOURS',
      params: { maxDailyDriveHours },
      source: 'constraints.maxDailyDriveHours',
    });
  }

  const lockedIds = resolveLockedActivityIds(metadata);
  for (const placeId of lockedIds) {
    hardConstraints.push({
      id: `hard:locked_activity:${placeId}`,
      kind: 'LOCKED_ACTIVITY',
      params: { placeId },
      source: 'constraints.mustPlaces|travelDecisionLatest',
    });
  }

  const tol = contract.changeStrategy?.tolerances;
  if (tol && (tol.maxPoiRemovals != null || tol.maxBudgetOverrunPct != null || tol.maxDelayMinutes != null)) {
    hardConstraints.push({
      id: `hard:change_strategy_cap:${contract.changeStrategy.archetype}`,
      kind: 'CHANGE_STRATEGY_CAP',
      params: { ...tol, archetype: contract.changeStrategy.archetype },
      source: 'contract.changeStrategy.tolerances',
    });
  }

  const principles = contract.objectives.rankedPrinciples ?? [];
  principles.forEach((p: TravelPrincipleKey, idx: number) => {
    softObjectives.push({
      id: `soft:${p}`,
      kind: principleToSoftKind(p),
      intensity: intensityFromRank(idx, principles.length),
      source: 'contract.objectives.rankedPrinciples',
    });
  });

  // confirm_first / automation → authority only
  const automation = contract.automation;
  const executionAuthority = {
    defaultLevel: automation.defaultLevel,
    confirmationRequired: [...(automation.confirmationRequired ?? [])],
    autoAllowed: [...(automation.autoAllowed ?? [])],
    automationPaused: Boolean(
      (stored as { automationPaused?: boolean } | undefined)?.automationPaused,
    ),
    scoringExcluded: true as const,
  };

  const paceFromIsd = String(
    asObj(asObj(asObj(metadata.icelandSelfDrive).drivingSettings).routePreferences)
      .pacePreference ??
      input.state?.userIntent?.pace ??
      pacing.level ??
      '',
  );
  const scoringHints = buildScoringHints(softObjectives, paceFromIsd);

  let policySource: CgusPolicySource = 'defaults';
  if (stored && (userConstraints.vehicle_type || userConstraints.vehicleType)) {
    policySource = 'mixed';
  } else if (stored) {
    policySource = 'travel_decision_contract';
  } else if (
    Object.keys(userConstraints).length > 0 ||
    Object.keys(metadata).length > 0
  ) {
    policySource = 'decision_state_hints';
  }

  return {
    schemaId: CGUS_OPTIMIZATION_POLICY_SCHEMA_ID,
    policyVersion: CGUS_OPTIMIZATION_POLICY_VERSION,
    contractVersion: contract.constraintsVersion,
    policySource,
    projectedAt: input.projectedAt ?? new Date().toISOString(),
    hardConstraints,
    softObjectives,
    executionAuthority,
    scoringHints,
    provenance: {
      contractPresent: !!stored,
      rankedPrinciples: principles.map(String),
      changeStrategyArchetype: contract.changeStrategy.archetype,
      vehicleType,
      fRoadAllowed,
      pace: paceFromIsd || undefined,
      maxDailyDriveHours,
    },
  };
}
