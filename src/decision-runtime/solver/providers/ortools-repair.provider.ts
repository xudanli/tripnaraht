/**
 * OR-Tools RepairProvider — shadow candidate generation only (ADR-008).
 * Never calls Plan Repository / Executor.
 */

import { Injectable, Logger } from '@nestjs/common';
import type {
  RepairProvider,
  RepairProviderInput,
  RepairProviderResult,
} from '../../candidates/contracts/decision-providers';
import { OrToolsSolverClient } from '../ortools-solver.client';
import {
  isOrToolsRepairShadowEnabled,
  resolveOrToolsSolverBaseUrl,
} from '../ortools-solver.config';
import { OptimizationProblemMapper } from '../mappers/optimization-problem.mapper';
import { SolverCandidateMapper } from '../mappers/solver-candidate.mapper';

@Injectable()
export class OrToolsRepairProvider implements RepairProvider {
  readonly providerId = 'ortools-repair' as const;
  private readonly logger = new Logger(OrToolsRepairProvider.name);

  constructor(
    private readonly solverClient: OrToolsSolverClient,
    private readonly problemMapper: OptimizationProblemMapper,
    private readonly candidateMapper: SolverCandidateMapper,
  ) {}

  async proposeRepairs(input: RepairProviderInput): Promise<RepairProviderResult> {
    if (!isOrToolsRepairShadowEnabled() || !resolveOrToolsSolverBaseUrl()) {
      return emptyResult(input.tripId);
    }

    const problem = this.problemMapper.fromProviderContext(input.providerContext);
    if (!problem) {
      return emptyResult(input.tripId);
    }

    // Enforce tripId consistency
    if (problem.tripId !== input.tripId) {
      this.logger.warn(
        `solver tripId mismatch provider=${input.tripId} problem=${problem.tripId}`,
      );
      return emptyResult(input.tripId);
    }

    const response = await this.solverClient.solve(problem);
    if (!response) {
      return emptyResult(input.tripId);
    }

    const proposals = this.candidateMapper.toRepairProposals(response);
    this.logger.log(
      `ortools-repair shadow proposals=${proposals.length} status=${response.status} elapsedMs=${response.solverMeta.elapsedMs}`,
    );

    return {
      schemaId: 'tripnara.repair_provider_result@v1',
      providerId: this.providerId,
      tripId: input.tripId,
      proposals,
      generatedAt: new Date().toISOString(),
    };
  }
}

function emptyResult(tripId: string): RepairProviderResult {
  return {
    schemaId: 'tripnara.repair_provider_result@v1',
    providerId: 'ortools-repair',
    tripId,
    proposals: [],
    generatedAt: new Date().toISOString(),
  };
}
