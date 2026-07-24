/**
 * Slice 3 — execution slip: observation → problem → workspace → finalize.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Rfc001DecisionProblem } from '../contracts/decision-problem.types';
import type { DecisionWorkspace } from '../contracts/decision-workspace.types';
import type { Rfc001DecisionRecord } from '../contracts/decision-record.types';
import type { ExecutionDepartureObservation } from '../contracts/execution-slip.types';
import type { PlanVersion } from '../contracts/plan-version.types';
import { isRfc001ShadowMode } from '../config/rfc001-iceland.config';
import { ExecutionSlipPipelineService } from '../detection/execution-slip-pipeline.service';
import { ExecutionSlipEvaluateService } from '../orchestration/execution-slip-evaluate.service';
import { DecisionWorkspaceService } from '../workspace/decision-workspace.service';
import { Rfc001DecisionProblemStoreService } from '../persistence/rfc001-decision-problem.store';
import { Rfc001DecisionFinalizeService } from './rfc001-decision-finalize.service';

export interface ExecutionSlipRunResult {
  runId: string;
  tripId: string;
  problem: Rfc001DecisionProblem | null;
  workspace: DecisionWorkspace | null;
  record: Rfc001DecisionRecord | null;
  planVersion: PlanVersion | null;
  humanDecisionRequired: boolean;
  shadowMode: boolean;
  noAction?: boolean;
}

@Injectable()
export class ExecutionSlipRunnerService {
  private readonly logger = new Logger(ExecutionSlipRunnerService.name);

  constructor(
    private readonly pipeline: ExecutionSlipPipelineService,
    private readonly evaluateService: ExecutionSlipEvaluateService,
    private readonly finalizeService: Rfc001DecisionFinalizeService,
    private readonly workspaceService: DecisionWorkspaceService,
    private readonly problemStore: Rfc001DecisionProblemStoreService,
  ) {}

  async runFullFromObservation(
    observation: ExecutionDepartureObservation,
    opts?: {
      remainingStayMinutes?: number;
      travelDurationMinutes?: number;
    },
  ): Promise<ExecutionSlipRunResult> {
    const tripId = observation.tripId;
    const pipelineResult = await this.pipeline.runFromObservation(observation, opts);

    if (!pipelineResult.problem) {
      return {
        ...this.emptyRun(tripId),
        noAction: !pipelineResult.impact.assessment.infeasible,
      };
    }

    const workspace = await this.evaluateService.evaluate({
      tripId,
      problem: pipelineResult.problem,
      evidence: pipelineResult.evidence,
      impact: pipelineResult.impact,
      remainingStayMinutes: opts?.remainingStayMinutes,
    });

    return this.finalizeWorkspace(tripId, workspace, pipelineResult.problem);
  }

  async evaluateAndFinalizeByProblemId(
    tripId: string,
    problemId: string,
  ): Promise<ExecutionSlipRunResult> {
    throw new NotFoundException(
      'Use runFullFromObservation for execution slip evaluate path',
    );
  }

  async finalizeByProblemId(
    tripId: string,
    problemId: string,
  ): Promise<ExecutionSlipRunResult> {
    const problem = await this.problemStore.get(tripId, problemId);
    if (!problem) {
      throw new NotFoundException(`Decision problem ${problemId} not found`);
    }

    const workspace = await this.workspaceService.getByProblemId(tripId, problemId);
    if (!workspace) {
      throw new NotFoundException(
        `Workspace for problem ${problemId} not found; run evaluate first`,
      );
    }
    if (workspace.status !== 'READY_FOR_FINALIZE') {
      throw new Error(
        `Workspace ${workspace.workspaceId} is ${workspace.status}; expected READY_FOR_FINALIZE`,
      );
    }

    return this.finalizeWorkspace(tripId, workspace, problem);
  }

  private async finalizeWorkspace(
    tripId: string,
    workspace: DecisionWorkspace,
    problem: Rfc001DecisionProblem,
  ): Promise<ExecutionSlipRunResult> {
    const result = await this.finalizeService.finalizeWorkspace(
      tripId,
      workspace,
      problem,
    );
    return {
      runId: result.runId,
      tripId: result.tripId,
      problem: result.problem,
      workspace: result.workspace,
      record: result.record,
      planVersion: result.planVersion,
      humanDecisionRequired: result.humanDecisionRequired,
      shadowMode: result.shadowMode,
    };
  }

  private emptyRun(tripId: string): ExecutionSlipRunResult {
    return {
      runId: '',
      tripId,
      problem: null,
      workspace: null,
      record: null,
      planVersion: null,
      humanDecisionRequired: false,
      shadowMode: isRfc001ShadowMode(),
    };
  }
}
