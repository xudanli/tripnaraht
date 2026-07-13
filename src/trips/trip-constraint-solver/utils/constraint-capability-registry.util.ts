/**
 * Phase 0 Constraint Capability Registry — static SSOT for BFF `items[].capability`.
 * @see internal-docs/product/CONSTRAINT-CAPABILITY-REGISTRY-PHASE0.md
 */
import type {
  TripConstraintCapability,
  TripConstraintCapabilityStages,
  ConstraintValidatorBinding,
} from '../types/constraint-capability.types';
import {
  PHASE0_CONSTRAINT_VALIDATOR_BINDINGS,
  validatorsForConstraintKey,
} from './constraint-validator-registry.util';
import {
  TRIP_CONSTRAINT_LEGACY_IDS,
  TRIP_CONSTRAINT_OFFICIAL_IS_IDS,
  type TripConstraint,
} from '../types/trip-constraint.types';

const ENABLED_ALL_STAGES: TripConstraintCapabilityStages = {
  planning: true,
  feasibility: true,
  execution: false,
  tep: false,
  optimizer: false,
};

const REGISTRY: Record<string, TripConstraintCapability> = {
  // §4.1 OPEN + ENABLED
  TIME_RANGE: {
    constraintKey: 'TIME_RANGE',
    enforcementLevel: 'ENABLED',
    stages: { ...ENABLED_ALL_STAGES, planning: true },
    phase0UiPolicy: 'OPEN',
  },
  BUDGET_TOTAL: {
    constraintKey: 'BUDGET_TOTAL',
    enforcementLevel: 'ENABLED',
    stages: { ...ENABLED_ALL_STAGES, feasibility: true },
    phase0UiPolicy: 'OPEN',
  },
  TRANSPORT_SELF_DRIVE: {
    constraintKey: 'TRANSPORT_SELF_DRIVE',
    enforcementLevel: 'ENABLED',
    stages: { planning: true, feasibility: false, execution: false, tep: true, optimizer: false },
    phase0UiPolicy: 'DEFAULT_ONLY',
  },
  MAX_DAILY_DRIVE: {
    constraintKey: 'MAX_DAILY_DRIVE',
    enforcementLevel: 'ENABLED',
    stages: { ...ENABLED_ALL_STAGES, feasibility: true, tep: true },
    phase0UiPolicy: 'OPEN',
    validators: PHASE0_CONSTRAINT_VALIDATOR_BINDINGS.MAX_DAILY_DRIVE,
  },
  NO_NIGHT_DRIVE: {
    constraintKey: 'NO_NIGHT_DRIVE',
    enforcementLevel: 'ENABLED',
    stages: { ...ENABLED_ALL_STAGES, feasibility: true, tep: true },
    phase0UiPolicy: 'OPEN',
    validators: PHASE0_CONSTRAINT_VALIDATOR_BINDINGS.NO_NIGHT_DRIVE,
  },
  // §4.2 official / world
  OFFICIAL_IS_FROAD_2WD: {
    constraintKey: 'OFFICIAL_IS_FROAD_2WD',
    enforcementLevel: 'PARTIAL',
    stages: { planning: false, feasibility: false, execution: true, tep: true, optimizer: false },
    phase0UiPolicy: 'DISPLAY_ONLY',
    validators: PHASE0_CONSTRAINT_VALIDATOR_BINDINGS.OFFICIAL_IS_FROAD_2WD,
  },
  OFFICIAL_IS_WINTER_FROAD: {
    constraintKey: 'OFFICIAL_IS_WINTER_FROAD',
    enforcementLevel: 'PARTIAL',
    stages: { planning: false, feasibility: false, execution: true, tep: true, optimizer: false },
    phase0UiPolicy: 'DISPLAY_ONLY',
  },
  OFFICIAL_IS_RED_ALERT: {
    constraintKey: 'OFFICIAL_IS_RED_ALERT',
    enforcementLevel: 'PARTIAL',
    stages: { planning: false, feasibility: false, execution: true, tep: false, optimizer: false },
    phase0UiPolicy: 'DISPLAY_ONLY',
  },
  OFFICIAL_IS_WIND_SAFETY: {
    constraintKey: 'OFFICIAL_IS_WIND_SAFETY',
    enforcementLevel: 'ADVISORY_ONLY',
    stages: { planning: false, feasibility: false, execution: false, tep: false, optimizer: false },
    phase0UiPolicy: 'DISPLAY_ONLY',
  },
  WORLD_FEASIBILITY: {
    constraintKey: 'WORLD_FEASIBILITY',
    enforcementLevel: 'PARTIAL',
    stages: { planning: false, feasibility: true, execution: false, tep: false, optimizer: false },
    phase0UiPolicy: 'DISPLAY_ONLY',
  },
  // §5.1 catalog HARD — registered ≠ enforce
  ELDERLY_WALK_LIMIT: {
    constraintKey: 'ELDERLY_WALK_LIMIT',
    enforcementLevel: 'DISPLAY_ONLY',
    stages: { planning: false, feasibility: false, execution: false, tep: false, optimizer: false },
    phase0UiPolicy: 'HIDDEN',
  },
  CHILD_NAP_TIME: {
    constraintKey: 'CHILD_NAP_TIME',
    enforcementLevel: 'DISPLAY_ONLY',
    stages: { planning: false, feasibility: false, execution: false, tep: false, optimizer: false },
    phase0UiPolicy: 'HIDDEN',
  },
  ACCESSIBILITY: {
    constraintKey: 'ACCESSIBILITY',
    enforcementLevel: 'DISPLAY_ONLY',
    stages: { planning: false, feasibility: false, execution: false, tep: false, optimizer: false },
    phase0UiPolicy: 'HIDDEN',
  },
  MOTION_SICKNESS: {
    constraintKey: 'MOTION_SICKNESS',
    enforcementLevel: 'DISPLAY_ONLY',
    stages: { planning: false, feasibility: false, execution: false, tep: false, optimizer: false },
    phase0UiPolicy: 'HIDDEN',
  },
  NO_UNPAVED_ROAD: {
    constraintKey: 'NO_UNPAVED_ROAD',
    enforcementLevel: 'PARTIAL',
    stages: { planning: false, feasibility: false, execution: true, tep: true, optimizer: false },
    phase0UiPolicy: 'DISPLAY_ONLY',
    validators: PHASE0_CONSTRAINT_VALIDATOR_BINDINGS.NO_UNPAVED_ROAD,
  },
  NO_BAD_WEATHER: {
    constraintKey: 'NO_BAD_WEATHER',
    enforcementLevel: 'PARTIAL',
    stages: { planning: false, feasibility: false, execution: false, tep: false, optimizer: false },
    phase0UiPolicy: 'DISPLAY_ONLY',
  },
  NO_HIGH_RISK_ACTIVITY: {
    constraintKey: 'NO_HIGH_RISK_ACTIVITY',
    enforcementLevel: 'DISPLAY_ONLY',
    stages: { planning: false, feasibility: false, execution: false, tep: false, optimizer: false },
    phase0UiPolicy: 'HIDDEN',
  },
  NO_UNVERIFIED_ROUTE: {
    constraintKey: 'NO_UNVERIFIED_ROUTE',
    enforcementLevel: 'PARTIAL',
    stages: { planning: false, feasibility: false, execution: false, tep: false, optimizer: false },
    phase0UiPolicy: 'HIDDEN',
  },
  EARLIEST_DEPARTURE: {
    constraintKey: 'EARLIEST_DEPARTURE',
    enforcementLevel: 'DISPLAY_ONLY',
    stages: { planning: false, feasibility: false, execution: false, tep: false, optimizer: false },
    phase0UiPolicy: 'HIDDEN',
  },
  LATEST_END: {
    constraintKey: 'LATEST_END',
    enforcementLevel: 'DISPLAY_ONLY',
    stages: { planning: false, feasibility: false, execution: false, tep: false, optimizer: false },
    phase0UiPolicy: 'HIDDEN',
  },
  MAX_DAILY_ACTIVITY: {
    constraintKey: 'MAX_DAILY_ACTIVITY',
    enforcementLevel: 'DISPLAY_ONLY',
    stages: { planning: false, feasibility: false, execution: false, tep: false, optimizer: false },
    phase0UiPolicy: 'HIDDEN',
  },
  REQUIRED_REST: {
    constraintKey: 'REQUIRED_REST',
    enforcementLevel: 'DISPLAY_ONLY',
    stages: { planning: false, feasibility: false, execution: false, tep: false, optimizer: false },
    phase0UiPolicy: 'HIDDEN',
  },
  FIXED_APPOINTMENTS: {
    constraintKey: 'FIXED_APPOINTMENTS',
    enforcementLevel: 'PARTIAL',
    stages: { planning: false, feasibility: true, execution: false, tep: true, optimizer: false },
    phase0UiPolicy: 'HIDDEN',
    validators: PHASE0_CONSTRAINT_VALIDATOR_BINDINGS.FIXED_APPOINTMENTS,
  },
  ACTIVITY_BUDGET: {
    constraintKey: 'ACTIVITY_BUDGET',
    enforcementLevel: 'DISPLAY_ONLY',
    stages: { planning: false, feasibility: false, execution: false, tep: false, optimizer: false },
    phase0UiPolicy: 'HIDDEN',
  },
  BUDGET_OVERRUN_TOLERANCE: {
    constraintKey: 'BUDGET_OVERRUN_TOLERANCE',
    enforcementLevel: 'PARTIAL',
    stages: { planning: false, feasibility: true, execution: false, tep: false, optimizer: false },
    phase0UiPolicy: 'HIDDEN',
  },
};

const LEGACY_ID_TO_KEY: Record<string, string> = {
  [TRIP_CONSTRAINT_LEGACY_IDS.TIME_RANGE]: 'TIME_RANGE',
  [TRIP_CONSTRAINT_LEGACY_IDS.BUDGET_TOTAL]: 'BUDGET_TOTAL',
  [TRIP_CONSTRAINT_LEGACY_IDS.TRANSPORT_MODE]: 'TRANSPORT_SELF_DRIVE',
  [TRIP_CONSTRAINT_LEGACY_IDS.MAX_DAILY_DRIVE]: 'MAX_DAILY_DRIVE',
  [TRIP_CONSTRAINT_LEGACY_IDS.NO_NIGHT_DRIVE]: 'NO_NIGHT_DRIVE',
  [TRIP_CONSTRAINT_LEGACY_IDS.WORLD_FEASIBILITY]: 'WORLD_FEASIBILITY',
  [TRIP_CONSTRAINT_OFFICIAL_IS_IDS.FROAD_2WD]: 'OFFICIAL_IS_FROAD_2WD',
  [TRIP_CONSTRAINT_OFFICIAL_IS_IDS.WINTER_FROAD]: 'OFFICIAL_IS_WINTER_FROAD',
  [TRIP_CONSTRAINT_OFFICIAL_IS_IDS.RED_ALERT]: 'OFFICIAL_IS_RED_ALERT',
  [TRIP_CONSTRAINT_OFFICIAL_IS_IDS.WIND_SAFETY]: 'OFFICIAL_IS_WIND_SAFETY',
};

const TEMPLATE_ID_TO_KEY: Record<string, string> = {
  time_range: 'TIME_RANGE',
  budget_total: 'BUDGET_TOTAL',
  transport_mode: 'TRANSPORT_SELF_DRIVE',
  max_daily_drive: 'MAX_DAILY_DRIVE',
  no_night_drive: 'NO_NIGHT_DRIVE',
  world_feasibility: 'WORLD_FEASIBILITY',
  elderly_walk_limit: 'ELDERLY_WALK_LIMIT',
  child_nap_time: 'CHILD_NAP_TIME',
  accessibility: 'ACCESSIBILITY',
  motion_sickness: 'MOTION_SICKNESS',
  no_unpaved_road: 'NO_UNPAVED_ROAD',
  no_bad_weather: 'NO_BAD_WEATHER',
  no_high_risk_activity: 'NO_HIGH_RISK_ACTIVITY',
  no_unverified_route: 'NO_UNVERIFIED_ROUTE',
  earliest_departure: 'EARLIEST_DEPARTURE',
  latest_end: 'LATEST_END',
  max_daily_activity: 'MAX_DAILY_ACTIVITY',
  required_rest: 'REQUIRED_REST',
  fixed_appointments: 'FIXED_APPOINTMENTS',
  activity_budget: 'ACTIVITY_BUDGET',
  budget_overrun_tolerance: 'BUDGET_OVERRUN_TOLERANCE',
};

function templateIdFromConstraint(c: TripConstraint): string | undefined {
  if (c.source.templateId) return c.source.templateId;
  if (c.id.startsWith('c_tpl_')) return c.id.replace(/^c_tpl_/, '');
  if (c.id.startsWith('c_official_')) {
    return (c.value as { ruleId?: string })?.ruleId ?? c.id.replace(/^c_official_/, '');
  }
  return undefined;
}

function constraintKeyFor(c: TripConstraint): string {
  const fromLegacy = LEGACY_ID_TO_KEY[c.id];
  if (fromLegacy) return fromLegacy;

  const templateId = templateIdFromConstraint(c);
  if (templateId) {
    const fromTemplate = TEMPLATE_ID_TO_KEY[templateId];
    if (fromTemplate) return fromTemplate;
    return templateId.replace(/-/g, '_').toUpperCase();
  }

  if (c.id.startsWith('c_official_')) {
    return c.id.replace(/^c_official_/, '').toUpperCase();
  }

  return c.id.replace(/^c_/, '').toUpperCase();
}

function defaultCapability(c: TripConstraint, constraintKey: string): TripConstraintCapability {
  if (c.type === 'SOFT') {
    return {
      constraintKey,
      enforcementLevel: 'ADVISORY_ONLY',
      stages: {
        planning: false,
        feasibility: false,
        execution: false,
        tep: false,
        optimizer: false,
      },
      phase0UiPolicy: 'HIDDEN',
    };
  }
  if (c.source.type === 'OFFICIAL_RULE') {
    return {
      constraintKey,
      enforcementLevel: 'PARTIAL',
      stages: { planning: false, feasibility: false, execution: true, tep: true, optimizer: false },
      phase0UiPolicy: 'DISPLAY_ONLY',
    };
  }
  return {
    constraintKey,
    enforcementLevel: 'DISPLAY_ONLY',
    stages: { planning: false, feasibility: false, execution: false, tep: false, optimizer: false },
    phase0UiPolicy: 'HIDDEN',
  };
}

export function resolveConstraintCapability(c: TripConstraint): TripConstraintCapability {
  const key = constraintKeyFor(c);
  const base = REGISTRY[key] ?? defaultCapability(c, key);
  if (base.validators?.length) return base;
  const validators = validatorsForConstraintKey(key);
  return validators.length ? { ...base, validators } : base;
}

/** DISPLAY_ONLY / ADVISORY_ONLY must not advertise hard block in BFF labels. */
export function shouldUseAdvisoryViolationLabel(
  capability: TripConstraintCapability,
): boolean {
  return (
    capability.enforcementLevel === 'DISPLAY_ONLY' ||
    capability.enforcementLevel === 'ADVISORY_ONLY'
  );
}

export function advisoryViolationLabelForCapability(
  capability: TripConstraintCapability,
): string {
  return capability.enforcementLevel === 'ADVISORY_ONLY' ? '尽量满足' : '偏好记录';
}
