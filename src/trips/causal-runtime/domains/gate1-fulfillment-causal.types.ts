/** P4 — Gate1 supplier / readiness fulfillment causal model (v1). */

export const GATE1_FULFILLMENT_CAUSAL_SCHEMA = 'tripnara/gate1-fulfillment-causal/v1' as const;

export type Gate1ReadinessFindingStatus = 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKER';

export interface Gate1FulfillmentBlockerInput {
  status: string;
  dimension: string;
  title: string;
  dueAt?: Date | string | null;
  responsibleParty?: string | null;
}

export interface Gate1FulfillmentCausalInput {
  blockers: Gate1FulfillmentBlockerInput[];
  /** Days until trip departure (negative = past) */
  daysToDeparture?: number;
  /** Override default supplier confirmation lead time (days) */
  supplierLeadTimeDays?: number;
}

export interface Gate1FulfillmentCausalOutput {
  schema: typeof GATE1_FULFILLMENT_CAUSAL_SCHEMA;
  departureFailureRisk: number;
  causalChain: string[];
  bindings: Array<{
    variable: string;
    label: string;
    baseValue?: number;
    projectedValue?: number;
    unit?: string;
  }>;
  userFacingAssessment: string;
  recommendedIntervention?: {
    type: 'ESCALATE_SUPPLIER' | 'ADVANCE_BOOKING' | 'ADVISOR_REVIEW';
    action: string;
    rationale: string;
  };
}
