export type ConstraintEnforcementLevel =
  | 'ENABLED'
  | 'PARTIAL'
  | 'DISPLAY_ONLY'
  | 'ADVISORY_ONLY';

export type ConstraintPhase0UiPolicy =
  | 'OPEN'
  | 'DISPLAY_ONLY'
  | 'HIDDEN'
  | 'DEFAULT_ONLY';

export interface TripConstraintCapabilityStages {
  planning: boolean;
  feasibility: boolean;
  execution: boolean;
  tep: boolean;
  optimizer: boolean;
}

export type ConstraintValidatorEngine = 'FEASIBILITY' | 'TEP' | 'RUNTIME';

export type ConstraintValidatorPhase = 'PLANNING' | 'EXECUTION';

export type ConstraintValidatorSeverity = 'BLOCK' | 'WARN' | 'INFO';

export interface ConstraintValidatorBinding {
  engine: ConstraintValidatorEngine;
  ruleId: string;
  phase: ConstraintValidatorPhase;
  severity: ConstraintValidatorSeverity;
  /** Optional mapper id for measuredValue / evidence projection */
  resultMapper?: string;
}

export interface TripConstraintCapability {
  constraintKey: string;
  enforcementLevel: ConstraintEnforcementLevel;
  stages: TripConstraintCapabilityStages;
  phase0UiPolicy: ConstraintPhase0UiPolicy;
  /** Phase 0 — who validates this constraint and when */
  validators?: ConstraintValidatorBinding[];
}
