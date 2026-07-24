/**
 * Fault injection matrix — organized by failure location (not HTTP status alone).
 * Each entry maps to an existing deterministic blocker or future harness hook.
 */

export type FaultLocation =
  | 'model'
  | 'tool_before_execution'
  | 'tool_after_execution'
  | 'db_before_commit'
  | 'db_after_external_side_effect'
  | 'evidence'
  | 'memory'
  | 'policy_gateway'
  | 'trace';

export type FaultInjectionCase = {
  faultId: string;
  location: FaultLocation;
  faultType: string;
  expectedBehavior: string;
  /** Blocker spec or runner that validates expected behavior today */
  blockerCaseId: string;
  phase: 'P1' | 'P2';
  implemented: boolean;
};

export const FAULT_INJECTION_MATRIX: FaultInjectionCase[] = [
  {
    faultId: 'FAULT-EVIDENCE-STALE-001',
    location: 'evidence',
    faultType: 'stale_high_risk_evidence',
    expectedBehavior: 'BLOCK auto-repair, require evidence refresh, no applyRepair side effect',
    blockerCaseId: 'POLICY-BLOCKER-STALE-001',
    phase: 'P1',
    implemented: true,
  },
  {
    faultId: 'FAULT-DB-AFTER-APPLY-VALIDATE-001',
    location: 'db_after_external_side_effect',
    faultType: 'post_apply_route_recalc_fail',
    expectedBehavior: 'ROLLED_BACK or PARTIALLY_APPLIED — never fake APPLIED',
    blockerCaseId: 'STATE-BLOCKER-PARTIAL-001',
    phase: 'P1',
    implemented: true,
  },
  {
    faultId: 'FAULT-TOOL-AFTER-EXEC-REPLAY-001',
    location: 'tool_after_execution',
    faultType: 'duplicate_apply_same_idempotency_key',
    expectedBehavior: 'Second call must not re-execute repair; query/replay not blind retry',
    blockerCaseId: 'DS-BLOCKER-IDEMPOTENCY-001',
    phase: 'P1',
    implemented: true,
  },
  {
    faultId: 'FAULT-MEMORY-UNAVAILABLE-001',
    location: 'memory',
    faultType: 'assembler_degraded',
    expectedBehavior: 'Degrade without fabricating recalled facts',
    blockerCaseId: 'MEM-BLOCKER-DELETE-001',
    phase: 'P2',
    implemented: false,
  },
  {
    faultId: 'FAULT-MODEL-TIMEOUT-001',
    location: 'model',
    faultType: 'timeout',
    expectedBehavior: 'Retry or model switch within LoopStopPolicy bounds',
    blockerCaseId: 'TBD-LOOP-STOP-001',
    phase: 'P2',
    implemented: false,
  },
  {
    faultId: 'FAULT-POLICY-GW-DOWN-001',
    location: 'policy_gateway',
    faultType: 'unavailable',
    expectedBehavior: 'Fail closed — no ungated auto-repair',
    blockerCaseId: 'TBD-POLICY-GW-FAIL-CLOSED-001',
    phase: 'P2',
    implemented: false,
  },
];

export function getImplementedFaultCases(): FaultInjectionCase[] {
  return FAULT_INJECTION_MATRIX.filter((c) => c.implemented);
}
