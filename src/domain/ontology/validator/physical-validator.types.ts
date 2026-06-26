/**
 * PhysicalValidator output — PREVIEW/COMMIT shared envelope (audit + QA Workbench).
 */

import type { ExperienceFulfillmentState } from '../../../trips/experience-fulfillment/types/experience-fulfillment-state.types';

export type PhysicalViolationSeverity = 'BLOCK' | 'WARN';

export interface PhysicalViolationItem {
  /** Stable machine code, e.g. SEGMENT_ROAD_CLOSED, travel_ontology_budget */
  code: string;
  severity: PhysicalViolationSeverity;
  detail: string;
  constraint?: string;
  /** SOFT constraint degree (e.g. budget overrun ratio); used by heal router + audit. */
  degree?: number;
  /** Optional upstream cite (Road API URL, admin evidence ref, etc.) */
  evidence_source?: string;
}

export interface PhysicalValidationSnapshot {
  validator_version: string;
  rule_bundle_id: string;
  violations: PhysicalViolationItem[];
  evaluated_at: string;
  /** True when any spatial / hard gate fires (ontology SOFT alone is typically false). */
  blocking: boolean;
}

export interface PhysicalEvaluationResult extends PhysicalValidationSnapshot {
  /** Round 3：体验兑现协议切片（VerificationResult + RepairContract） */
  experience_fulfillment?: ExperienceFulfillmentState;
}

/** Optional client-supplied spatial fact for segment feasibility (action_input.physical_domain). */
export interface PhysicalDomainFactInput {
  segment_id?: string;
  enter_at?: string;
  vehicle_type?: 'SEDAN' | 'SUV' | 'FOUR_BY_FOUR';
}

/** Subset that must be stable between PREVIEW and COMMIT for context_signature (excludes evaluated_at). */
export function toPhysicalValidationSignable(
  physical: Pick<PhysicalEvaluationResult, 'validator_version' | 'rule_bundle_id' | 'violations' | 'blocking'>,
): Pick<PhysicalEvaluationResult, 'validator_version' | 'rule_bundle_id' | 'violations' | 'blocking'> {
  return {
    validator_version: physical.validator_version,
    rule_bundle_id: physical.rule_bundle_id,
    violations: physical.violations,
    blocking: physical.blocking,
  };
}
