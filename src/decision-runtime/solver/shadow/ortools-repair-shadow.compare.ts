/**
 * Pure compare helpers for OR-Tools repair shadow (ADR-008 S2).
 */

import type { RepairProposal, RepairProviderResult } from '../../candidates/contracts/decision-providers';
import type { SolverCandidate, SolverResponse } from '../contracts/solver-response';
import type { SolverConstraint, SolverProblem } from '../contracts/solver-problem';
import {
  ORTOOLS_REPAIR_SHADOW_SCHEMA_ID,
  type OrToolsRepairShadowReport,
} from './ortools-repair-shadow.types';

export function extractForbiddenEdges(
  problem: SolverProblem,
): Array<{ fromNodeId: string; toNodeId: string }> {
  return problem.constraints
    .filter((c): c is SolverConstraint => c.kind === 'EDGE_FORBIDDEN' && c.hard)
    .map((c) => ({
      fromNodeId: String(c.payload.fromNodeId ?? ''),
      toNodeId: String(c.payload.toNodeId ?? ''),
    }))
    .filter((e) => e.fromNodeId && e.toNodeId);
}

export function countForbiddenEdgeViolations(
  candidates: SolverCandidate[],
  forbidden: Array<{ fromNodeId: string; toNodeId: string }>,
): number {
  if (!forbidden.length) return 0;
  let n = 0;
  for (const cand of candidates) {
    for (const day of cand.dayPlans) {
      for (let i = 0; i < day.nodeIds.length - 1; i++) {
        const a = day.nodeIds[i];
        const b = day.nodeIds[i + 1];
        if (forbidden.some((e) => e.fromNodeId === a && e.toNodeId === b)) {
          n += 1;
        }
      }
    }
  }
  return n;
}

export function detectBookedNodeDropped(
  problem: SolverProblem,
  candidates: SolverCandidate[],
): boolean {
  const booked = problem.nodes.filter((n) => n.isBooked).map((n) => n.nodeId);
  if (!booked.length || !candidates.length) return false;
  for (const cand of candidates) {
    const present = new Set(cand.dayPlans.flatMap((d) => d.nodeIds));
    if (booked.some((id) => !present.has(id))) return true;
  }
  return false;
}

export function detectUndeclaredNodeDrops(
  problem: SolverProblem,
  candidates: SolverCandidate[],
): boolean {
  const mandatory = problem.nodes
    .filter((n) => n.isMandatory && !n.canRemove)
    .map((n) => n.nodeId);
  if (!mandatory.length || !candidates.length) return false;
  for (const cand of candidates) {
    const present = new Set(cand.dayPlans.flatMap((d) => d.nodeIds));
    if (mandatory.some((id) => !present.has(id))) return true;
  }
  return false;
}

export function buildOrToolsRepairShadowReport(input: {
  tripId: string;
  requestId: string;
  authorityProviderId: string;
  authority: RepairProviderResult;
  shadow: RepairProviderResult;
  problem: SolverProblem;
  solverResponse: SolverResponse | null;
}): OrToolsRepairShadowReport {
  const candidates = input.solverResponse?.candidates ?? [];
  const forbidden = extractForbiddenEdges(input.problem);
  const notes: string[] = [];

  if (input.solverResponse?.solverMeta.nativeCpSat === true) {
    notes.push('nativeCpSat=true unexpected for Routing MVP');
  }
  if (!input.solverResponse) {
    notes.push('shadow solver unavailable or skipped');
  }

  return {
    schemaId: ORTOOLS_REPAIR_SHADOW_SCHEMA_ID,
    tripId: input.tripId,
    requestId: input.requestId,
    comparedAt: new Date().toISOString(),
    authorityProviderId: input.authorityProviderId,
    shadowProviderId: 'ortools-repair',
    authorityProposalCount: input.authority.proposals.length,
    shadowProposalCount: input.shadow.proposals.length,
    shadowFoundCandidate: candidates.length > 0 || input.shadow.proposals.length > 0,
    shadowStatus: input.solverResponse?.status,
    shadowElapsedMs: input.solverResponse?.solverMeta.elapsedMs,
    shadowNativeCpSat: input.solverResponse?.solverMeta.nativeCpSat ?? false,
    shadowEngine: input.solverResponse?.solverMeta.engine,
    forbiddenEdgeViolations: countForbiddenEdgeViolations(candidates, forbidden),
    bookedNodeDropped: detectBookedNodeDropped(input.problem, candidates),
    undeclaredNodeDrops: detectUndeclaredNodeDrops(input.problem, candidates),
    writeAttempted: false,
    gatewayRequired: true,
    notes,
  };
}

/** Map shadow proposals for logging — authority proposals stay untouched. */
export function summarizeProposals(proposals: RepairProposal[]): string[] {
  return proposals.map((p) => p.candidateId);
}
