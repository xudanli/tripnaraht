/**
 * Map SolverResponse → RepairProposal / DecisionCandidate shells.
 * Does not authorize writes. TripPlan day-order apply is S2.
 */

import { Injectable } from '@nestjs/common';
import type { RepairProposal } from '../../candidates/contracts/decision-providers';
import type { DecisionCandidate } from '../../candidates/contracts/decision-candidate';
import type { TripPlan } from '../../../trips/decision/plan-model';
import type { SolverCandidate, SolverResponse } from '../contracts/solver-response';

@Injectable()
export class SolverCandidateMapper {
  toRepairProposals(response: SolverResponse): RepairProposal[] {
    return response.candidates.map((c) => this.toRepairProposal(c, response));
  }

  toRepairProposal(candidate: SolverCandidate, response: SolverResponse): RepairProposal {
    const reasonCodes = [
      `ortools:${candidate.operation}`,
      `engine:${response.solverMeta.engine}`,
      `status:${response.status}`,
      `nativeCpSat:${response.solverMeta.nativeCpSat}`,
      ...(candidate.dayPlans[0]?.nodeIds?.map((id, i) => `order:${i}:${id}`) ?? []).slice(
        0,
        12,
      ),
      ...(candidate.diffHint?.swappedPairs?.map((p) => `swap:${p.a}->${p.b}`) ?? []),
    ];
    return {
      proposalId: candidate.candidateId,
      candidateId: candidate.candidateId,
      label: candidate.label,
      reasonCodes,
    };
  }

  /**
   * Shadow compare helper: attach base plan so Gateway has a TripPlan handle.
   * Order application onto a real TripPlan is intentionally not done here yet.
   */
  toDecisionCandidates(
    response: SolverResponse,
    basePlan: TripPlan,
  ): DecisionCandidate[] {
    const now = new Date().toISOString();
    return response.candidates.map((c) => ({
      candidateId: c.candidateId,
      label: c.label,
      source: 'OR_TOOLS_REPAIR' as const,
      plan: basePlan,
      utilityHint: c.objectiveValue,
      createdAt: now,
    }));
  }
}
