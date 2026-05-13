import type {
  FrozenExecutionPolicyHook,
  ItineraryGenerateResultType,
  PartialExecutionState,
  RecoveryAction,
} from '../../../world/operational/execution-governance.contract';

/**
 * decision.memory.execution — append-only friendly record for TripNARA continuity.
 */
export interface ExecutionGovernanceMemoryRecord {
  affectedGenerator: 'itinerary.generate' | 'incremental_itinerary_generator';
  policyVersion?: string;
  policySource?: string;
  policyGeneratedAt?: number;
  causedByPolicies?: string[];
  suppressionApplied: boolean;
  blockedReason?: string[];
  resultType: ItineraryGenerateResultType;
  partialExecutionState: PartialExecutionState;
  recoverySuggested?: RecoveryAction[];
}

export function buildExecutionGovernanceMemoryRecord(args: {
  affectedGenerator: ExecutionGovernanceMemoryRecord['affectedGenerator'];
  hook?: FrozenExecutionPolicyHook;
  suppressionApplied: boolean;
  resultType: ItineraryGenerateResultType;
  partialExecutionState: PartialExecutionState;
  recoverySuggested?: RecoveryAction[];
}): ExecutionGovernanceMemoryRecord {
  const h = args.hook;
  return {
    affectedGenerator: args.affectedGenerator,
    policyVersion: h?.policyVersion,
    policySource: h?.policySource,
    policyGeneratedAt: h?.policyGeneratedAt,
    causedByPolicies: h ? [...h.causedByPolicies] : undefined,
    suppressionApplied: args.suppressionApplied,
    blockedReason:
      args.resultType === 'execution_block' && h?.blockingSummary?.length
        ? [...h.blockingSummary]
        : undefined,
    resultType: args.resultType,
    partialExecutionState: args.partialExecutionState,
    recoverySuggested: args.recoverySuggested,
  };
}
