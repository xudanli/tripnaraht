/**
 * Shadow dual-run report — OR-Tools vs authoritative repair (ADR-008 S2).
 * Never authorizes writes.
 */

import type { RepairProviderResult } from '../../candidates/contracts/decision-providers';
import type { SolverResponse } from '../contracts/solver-response';

export const ORTOOLS_REPAIR_SHADOW_SCHEMA_ID =
  'tripnara.ortools_repair_shadow@v1' as const;

export interface OrToolsRepairShadowReport {
  schemaId: typeof ORTOOLS_REPAIR_SHADOW_SCHEMA_ID;
  tripId: string;
  requestId: string;
  comparedAt: string;

  authorityProviderId: string;
  shadowProviderId: 'ortools-repair';

  authorityProposalCount: number;
  shadowProposalCount: number;
  shadowFoundCandidate: boolean;

  shadowStatus?: string;
  shadowElapsedMs?: number;
  shadowNativeCpSat: boolean;
  shadowEngine?: string;

  /** Candidates that still traverse a projected EDGE_FORBIDDEN hop */
  forbiddenEdgeViolations: number;
  /** Booked/depot node missing from a shadow day plan */
  bookedNodeDropped: boolean;
  /** Shadow dropped a non-optional node without canRemove */
  undeclaredNodeDrops: boolean;

  /** Structural: this path never writes Effective Plan / Plan Version */
  writeAttempted: false;
  /** Gateway still required — solverFeasible ≠ executability */
  gatewayRequired: true;

  notes: string[];
}

export interface OrToolsRepairShadowBundle {
  authority: RepairProviderResult;
  shadow: RepairProviderResult;
  solverResponse: SolverResponse | null;
  report: OrToolsRepairShadowReport;
}
