/**
 * Dual-run: authoritative repair (e.g. neptune) + OR-Tools shadow.
 * Authority proposals are returned for downstream use; shadow never writes.
 *
 * @see ADR-008-OR-Tools-Candidate-Provider.md
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { NeptuneRepairProvider } from '../../candidates/providers/neptune-repair.provider';
import type {
  RepairProviderInput,
  RepairProviderResult,
} from '../../candidates/contracts/decision-providers';
import { OrToolsRepairProvider } from '../providers/ortools-repair.provider';
import { OrToolsSolverClient } from '../ortools-solver.client';
import { OptimizationProblemMapper } from '../mappers/optimization-problem.mapper';
import { SolverCandidateMapper } from '../mappers/solver-candidate.mapper';
import {
  isOrToolsRepairShadowEnabled,
  resolveOrToolsSolverBaseUrl,
} from '../ortools-solver.config';
import type { SolverProblem } from '../contracts/solver-problem';
import { buildOrToolsRepairShadowReport } from './ortools-repair-shadow.compare';
import type { OrToolsRepairShadowBundle } from './ortools-repair-shadow.types';

@Injectable()
export class OrToolsRepairShadowService {
  private readonly logger = new Logger(OrToolsRepairShadowService.name);
  private readonly recent: OrToolsRepairShadowBundle[] = [];

  constructor(
    private readonly ortoolsRepair: OrToolsRepairProvider,
    private readonly solverClient: OrToolsSolverClient,
    private readonly problemMapper: OptimizationProblemMapper,
    private readonly candidateMapper: SolverCandidateMapper,
    @Optional() private readonly neptuneRepair?: NeptuneRepairProvider,
  ) {}

  getRecentReports(limit = 20) {
    return this.recent.slice(-limit).map((b) => b.report);
  }

  /**
   * Run authority + shadow. Downstream must use `authority` only for decisions.
   */
  async compare(input: {
    repairInput: RepairProviderInput;
    /** Explicit SolverProblem; else read providerContext.ortools */
    solverProblem?: SolverProblem;
    authorityProviderId?: string;
  }): Promise<OrToolsRepairShadowBundle> {
    const authorityProviderId = input.authorityProviderId ?? 'neptune-repair';
    const authority = await this.runAuthority(input.repairInput);

    const problem =
      input.solverProblem ??
      this.problemMapper.fromProviderContext(input.repairInput.providerContext);

    let shadow: RepairProviderResult = emptyShadow(input.repairInput.tripId);
    let solverResponse = null as OrToolsRepairShadowBundle['solverResponse'];

    if (
      problem &&
      isOrToolsRepairShadowEnabled() &&
      resolveOrToolsSolverBaseUrl()
    ) {
      solverResponse = await this.solverClient.solve(problem);
      if (solverResponse) {
        shadow = {
          schemaId: 'tripnara.repair_provider_result@v1',
          providerId: 'ortools-repair',
          tripId: input.repairInput.tripId,
          proposals: this.candidateMapper.toRepairProposals(solverResponse),
          generatedAt: new Date().toISOString(),
        };
      } else {
        // Fallback through provider (same client; records empty when down)
        shadow = await this.ortoolsRepair.proposeRepairs({
          ...input.repairInput,
          providerContext: {
            ...input.repairInput.providerContext,
            ortools: { solverProblem: problem },
          },
        });
      }
    }

    const report = buildOrToolsRepairShadowReport({
      tripId: input.repairInput.tripId,
      requestId: problem?.requestId ?? `shadow:${input.repairInput.tripId}`,
      authorityProviderId,
      authority,
      shadow,
      problem: problem ?? emptyProblemStub(input.repairInput.tripId),
      solverResponse,
    });

    this.logger.log(
      `ortools shadow trip=${report.tripId} auth=${report.authorityProposalCount} ` +
        `shadow=${report.shadowProposalCount} forbidViol=${report.forbiddenEdgeViolations} ` +
        `writeAttempted=${report.writeAttempted} gatewayRequired=${report.gatewayRequired}`,
    );

    const bundle: OrToolsRepairShadowBundle = {
      authority,
      shadow,
      solverResponse,
      report,
    };
    this.recent.push(bundle);
    if (this.recent.length > 100) this.recent.shift();
    return bundle;
  }

  private async runAuthority(
    repairInput: RepairProviderInput,
  ): Promise<RepairProviderResult> {
    if (this.neptuneRepair) {
      return this.neptuneRepair.proposeRepairs(repairInput);
    }
    return {
      schemaId: 'tripnara.repair_provider_result@v1',
      providerId: 'neptune-repair',
      tripId: repairInput.tripId,
      proposals: [],
      generatedAt: new Date().toISOString(),
    };
  }
}

function emptyShadow(tripId: string): RepairProviderResult {
  return {
    schemaId: 'tripnara.repair_provider_result@v1',
    providerId: 'ortools-repair',
    tripId,
    proposals: [],
    generatedAt: new Date().toISOString(),
  };
}

function emptyProblemStub(tripId: string): SolverProblem {
  return {
    schemaId: 'tripnara.solver_problem@v1',
    requestId: `stub:${tripId}`,
    tripId,
    planVersionId: 'unknown',
    operation: 'SWAP',
    scope: { dayIds: ['day-1'] },
    nodes: [],
    travelMatrix: { nodeIds: [], costsMin: [] },
    constraints: [],
    objectives: [],
    solverConfig: { maxCandidates: 3, timeLimitMs: 1, seed: 0 },
  };
}
