/**
 * P2 — Constraint Gateway ON rollout plan (selected scenarios only).
 * Authority remains legacy boolean until each scenario meets shadow metrics.
 */

export const CONSTRAINT_ON_ROLLOUT_VERSION = 'constraint-on-rollout@v1';

export type ConstraintRolloutPhase =
  | 'SHADOW_COMPARE'
  | 'ON_FOR_SELECTED'
  | 'DEFAULT_ON'
  | 'LEGACY_DEPRECATED';

export interface ConstraintOnRolloutEntry {
  scenarioId: string;
  label: string;
  constraintCodes: string[];
  triggerKinds: string[];
  currentPhase: ConstraintRolloutPhase;
  /** Minimum staging probes before ON */
  minShadowProbes: number;
  /** Max acceptable divergence rate before ON (0–1) */
  maxDivergenceRate: number;
  notes?: string;
}

/** P2 initial catalog — all remain SHADOW_COMPARE until metrics达标 */
export const CONSTRAINT_ON_ROLLOUT_ENTRIES: ConstraintOnRolloutEntry[] = [
  {
    scenarioId: 'iceland-road-closed',
    label: 'Iceland pack ROAD_CLOSED',
    constraintCodes: ['ROAD_CLOSED', 'ROAD_SEGMENT_UNAVAILABLE'],
    triggerKinds: ['CANONICAL_PROBLEM_EVALUATE', 'WORLD_EVENT'],
    currentPhase: 'ON_FOR_SELECTED',
    minShadowProbes: 3,
    maxDivergenceRate: 0.5,
    notes: 'P4: staging probes PASS (iceland-pack-road-closed)',
  },
  {
    scenarioId: 'weather-outdoor-storm',
    label: 'Weather ACTIVITY_PROHIBITED',
    constraintCodes: ['WEATHER_ACTIVITY_PROHIBITED'],
    triggerKinds: ['CANONICAL_PROBLEM_EVALUATE', 'CANONICAL_MONITORING_POLL'],
    currentPhase: 'ON_FOR_SELECTED',
    minShadowProbes: 3,
    maxDivergenceRate: 0.3,
    notes: 'P4: staging probes PASS',
  },
  {
    scenarioId: 'daily-load-excessive',
    label: 'Daily EXCESSIVE_DRIVE / load',
    constraintCodes: ['EXCESSIVE_DAILY_LOAD'],
    triggerKinds: ['CANONICAL_PROBLEM_EVALUATE', 'FULL_PLAN_SELECTION'],
    currentPhase: 'ON_FOR_SELECTED',
    minShadowProbes: 3,
    maxDivergenceRate: 0.2,
  },
  {
    scenarioId: 'opening-hours-conflict',
    label: 'Opening hours / reservation conflict',
    constraintCodes: ['OPENING_HOURS_CONFLICT', 'RESERVATION_REQUIRED'],
    triggerKinds: ['CANONICAL_PROBLEM_EVALUATE'],
    currentPhase: 'ON_FOR_SELECTED',
    minShadowProbes: 5,
    maxDivergenceRate: 0.25,
    notes: 'P4: constraint-shadow staging probe PASS (TIME_WINDOW_VIOLATION)',
  },
  {
    scenarioId: 'guide-plan-selection',
    label: 'Guide canonical plan selection',
    constraintCodes: ['*'],
    triggerKinds: ['GUIDE_IMPORT_REQUEST'],
    currentPhase: 'ON_FOR_SELECTED',
    minShadowProbes: 5,
    maxDivergenceRate: 0.2,
    notes: 'P4: guide-canonical-selection + accept wired via Trigger Gateway',
  },
  {
    scenarioId: 'full-plan-selection',
    label: 'Full plan selection',
    constraintCodes: ['*'],
    triggerKinds: ['FULL_PLAN_SELECTION'],
    currentPhase: 'ON_FOR_SELECTED',
    minShadowProbes: 5,
    maxDivergenceRate: 0.2,
    notes: 'P4: P1 trigger wired + canonical plan selection path',
  },
  {
    scenarioId: 'in-trip-replan',
    label: 'In-trip deviation / recovery',
    constraintCodes: ['*'],
    triggerKinds: ['IN_TRIP_DEVIATION', 'MANUAL_REPAIR_REQUEST'],
    currentPhase: 'ON_FOR_SELECTED',
    minShadowProbes: 5,
    maxDivergenceRate: 0.3,
    notes: 'P4: P3 in-trip policy gate + bounded LNS',
  },
  {
    scenarioId: 'iceland-ontology-vehicle-route',
    label: 'Iceland Ontology vehicle / F-road / contract',
    constraintCodes: [
      'VEHICLE_CAPABILITY_MISMATCH',
      'RENTAL_CONTRACT_ROAD_PROHIBITION',
      'ROAD_STATUS_BLOCKED',
    ],
    triggerKinds: ['CANONICAL_PROBLEM_EVALUATE', 'EXPLORATION_RELIABILITY_CHECK'],
    currentPhase: 'ON_FOR_SELECTED',
    minShadowProbes: 3,
    maxDivergenceRate: 0.25,
    notes: 'Sprint B: TravelWorldFact + OntologyConstraintProvider',
  },
  {
    scenarioId: 'iceland-ontology-insurance-entry',
    label: 'Iceland Ontology insurance / visa / rental pickup',
    constraintCodes: [
      'INSURANCE_WATER_CROSSING_GAP',
      'INSURANCE_UNDERCARRIAGE_UNKNOWN',
      'ENTRY_ELIGIBILITY_UNKNOWN',
      'VISA_STATUS_UNCONFIRMED',
      'RENTAL_PICKUP_WINDOW_CONFLICT',
    ],
    triggerKinds: ['CANONICAL_PROBLEM_EVALUATE', 'EXPLORATION_RELIABILITY_CHECK'],
    currentPhase: 'ON_FOR_SELECTED',
    minShadowProbes: 3,
    maxDivergenceRate: 0.25,
    notes: 'Sprint B: §24 scenarios 2/4/5',
  },
];

export function snapshotConstraintOnRolloutCatalog() {
  const shadowCount = CONSTRAINT_ON_ROLLOUT_ENTRIES.filter(
    (e) => e.currentPhase === 'SHADOW_COMPARE',
  ).length;
  return {
    schemaId: 'tripnara.constraint_on_rollout_catalog@v1',
    version: CONSTRAINT_ON_ROLLOUT_VERSION,
    entryCount: CONSTRAINT_ON_ROLLOUT_ENTRIES.length,
    shadowCompareCount: shadowCount,
    onForSelectedCount: CONSTRAINT_ON_ROLLOUT_ENTRIES.filter(
      (e) => e.currentPhase === 'ON_FOR_SELECTED',
    ).length,
    entries: CONSTRAINT_ON_ROLLOUT_ENTRIES,
  };
}
