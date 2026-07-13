/**
 * Phase 0 Constraint ↔ Validator bindings (SDR / feasibility rule ids).
 * @see internal-docs/product/CONSTRAINT-CAPABILITY-REGISTRY-PHASE0.md
 */
import type { ConstraintValidatorBinding } from '../types/constraint-capability.types';

/** P0 frozen bindings — constraintKey → validators */
export const PHASE0_CONSTRAINT_VALIDATOR_BINDINGS: Record<string, ConstraintValidatorBinding[]> = {
  MAX_DAILY_DRIVE: [
    {
      engine: 'FEASIBILITY',
      ruleId: 'max_daily_drive',
      phase: 'PLANNING',
      severity: 'BLOCK',
    },
    {
      engine: 'TEP',
      ruleId: 'SDR-101',
      phase: 'PLANNING',
      severity: 'BLOCK',
      resultMapper: 'tep.sdr101.dailyLoad',
    },
  ],
  NO_NIGHT_DRIVE: [
    {
      engine: 'FEASIBILITY',
      ruleId: 'no_night_drive',
      phase: 'PLANNING',
      severity: 'BLOCK',
    },
    {
      engine: 'TEP',
      ruleId: 'SDR-202',
      phase: 'PLANNING',
      severity: 'BLOCK',
      resultMapper: 'tep.sdr202.daylight',
    },
  ],
  OFFICIAL_IS_FROAD_2WD: [
    {
      engine: 'TEP',
      ruleId: 'SDR-001',
      phase: 'PLANNING',
      severity: 'BLOCK',
      resultMapper: 'tep.sdr001.vehicleRoad',
    },
  ],
  NO_UNPAVED_ROAD: [
    {
      engine: 'TEP',
      ruleId: 'SDR-003',
      phase: 'PLANNING',
      severity: 'BLOCK',
      resultMapper: 'tep.sdr003.rental',
    },
  ],
  FIXED_APPOINTMENTS: [
    {
      engine: 'FEASIBILITY',
      ruleId: 'fixed_appointments',
      phase: 'PLANNING',
      severity: 'WARN',
    },
    {
      engine: 'TEP',
      ruleId: 'SDR-203',
      phase: 'PLANNING',
      severity: 'BLOCK',
      resultMapper: 'tep.sdr203.schedule',
    },
  ],
};

const SDR_TO_CONSTRAINT_KEY = new Map<string, string>();
for (const [constraintKey, bindings] of Object.entries(PHASE0_CONSTRAINT_VALIDATOR_BINDINGS)) {
  for (const binding of bindings) {
    if (binding.engine === 'TEP') {
      SDR_TO_CONSTRAINT_KEY.set(binding.ruleId, constraintKey);
    }
  }
}

const FEASIBILITY_RULE_TO_CONSTRAINT_KEY: Record<string, string> = {
  max_daily_drive: 'MAX_DAILY_DRIVE',
  no_night_drive: 'NO_NIGHT_DRIVE',
  fixed_appointments: 'FIXED_APPOINTMENTS',
};

const FEASIBILITY_SEMANTIC_TO_CONSTRAINT_KEY: Record<string, string> = {
  EXCESSIVE_DAILY_LOAD: 'MAX_DAILY_DRIVE',
  WEATHER_ROUTE_RISK: 'NO_NIGHT_DRIVE',
  ROAD_SEGMENT_RESTRICTED: 'OFFICIAL_IS_FROAD_2WD',
  RENTAL_CONTRACT_VIOLATION: 'NO_UNPAVED_ROAD',
  EXECUTION_SCHEDULE_INFEASIBLE: 'FIXED_APPOINTMENTS',
  TIME_WINDOW_INFEASIBLE: 'FIXED_APPOINTMENTS',
};

export function resolveConstraintKeyForSdrRule(ruleId: string): string | undefined {
  return SDR_TO_CONSTRAINT_KEY.get(ruleId);
}

export function resolveConstraintKeyForFeasibilityIssue(input: {
  issueKind?: string | null;
  semanticKey?: string | null;
  proofs?: Array<{ constraint?: string; ruleId?: string }>;
}): string | undefined {
  const semanticKey = input.semanticKey?.trim();
  if (semanticKey && FEASIBILITY_SEMANTIC_TO_CONSTRAINT_KEY[semanticKey]) {
    return FEASIBILITY_SEMANTIC_TO_CONSTRAINT_KEY[semanticKey];
  }

  const proofConstraint = input.proofs?.find((p) => p.constraint)?.constraint;
  if (proofConstraint && FEASIBILITY_RULE_TO_CONSTRAINT_KEY[proofConstraint]) {
    return FEASIBILITY_RULE_TO_CONSTRAINT_KEY[proofConstraint];
  }

  const issueKind = input.issueKind?.trim();
  if (issueKind === 'daily_drive') return 'MAX_DAILY_DRIVE';
  if (issueKind === 'no_night_drive') return 'NO_NIGHT_DRIVE';
  if (issueKind === 'road_class') return 'OFFICIAL_IS_FROAD_2WD';
  if (issueKind === 'rental_contract') return 'NO_UNPAVED_ROAD';
  if (issueKind === 'inter_day_travel' || issueKind === 'poi_access_blocked') {
    return 'FIXED_APPOINTMENTS';
  }

  return undefined;
}

export function validatorsForConstraintKey(constraintKey: string): ConstraintValidatorBinding[] {
  return PHASE0_CONSTRAINT_VALIDATOR_BINDINGS[constraintKey] ?? [];
}

export function phase0AssessmentConstraintKeys(): string[] {
  return Object.keys(PHASE0_CONSTRAINT_VALIDATOR_BINDINGS);
}
