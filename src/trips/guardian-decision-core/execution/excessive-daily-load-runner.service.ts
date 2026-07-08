/**
 * Slice 3 — excessive daily load: evidence → problem → workspace → Decision Core finalize.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Rfc001DecisionProblem } from '../contracts/decision-problem.types';
import type { DecisionWorkspace } from '../contracts/decision-workspace.types';
import type { Rfc001DecisionRecord } from '../contracts/decision-record.types';
import type { DailyLoadChangedEvent } from '../evidence/daily-load-changed.event';
import { isRfc001ShadowMode } from '../config/rfc001-iceland.config';
import { ExcessiveDailyLoadPipelineService } from '../detection/excessive-daily-load-pipeline.service';
import { ExcessiveDailyLoadEvaluateService } from '../orchestration/excessive-daily-load-evaluate.service';
import { DecisionWorkspaceService } from '../workspace/decision-workspace.service';
import { Rfc001DecisionProblemStoreService } from '../persistence/rfc001-decision-problem.store';
import type { PlanVersion } from '../contracts/plan-version.types';
import { Rfc001DecisionFinalizeService } from './rfc001-decision-finalize.service';

export interface ExcessiveDailyLoadRunResult {
  runId: string;
  tripId: string;
  problem: Rfc001DecisionProblem | null;
  workspace: DecisionWorkspace | null;
  record: Rfc001DecisionRecord | null;
  planVersion: PlanVersion | null;
  humanDecisionRequired: boolean;
  shadowMode: boolean;
}

@Injectable()
export class ExcessiveDailyLoadRunnerService {
  private readonly logger = new Logger(ExcessiveDailyLoadRunnerService.name);

  constructor(
    private readonly pipeline: ExcessiveDailyLoadPipelineService,
    private readonly evaluateService: ExcessiveDailyLoadEvaluateService,
    private readonly finalizeService: Rfc001DecisionFinalizeService,
    private readonly workspaceService: DecisionWorkspaceService,
    private readonly problemStore: Rfc001DecisionProblemStoreService,
  ) {}

  async runFullFromEvent(
    event: DailyLoadChangedEvent,
  ): Promise<ExcessiveDailyLoadRunResult> {
    const tripId = event.aggregateId;
    const pipelineResult = await this.pipeline.runFromEvent(event);
    if (!pipelineResult.problem) {
      return this.emptyRun(tripId);
    }

    const workspace = await this.evaluateService.evaluate({
      tripId,
      problem: pipelineResult.problem,
      evidence: pipelineResult.evidence,
      impact: pipelineResult.impact,
    });

    return this.finalizeWorkspace(tripId, workspace, pipelineResult.problem);
  }

  async runFullFromPlanScan(tripId: string): Promise<ExcessiveDailyLoadRunResult> {
    const pipelineResult = await this.pipeline.scanTrip(tripId);
    if (!pipelineResult?.problem) {
      return this.emptyRun(tripId);
    }

    const workspace = await this.evaluateService.evaluate({
      tripId,
      problem: pipelineResult.problem,
      evidence: pipelineResult.evidence,
      impact: pipelineResult.impact,
    });

    return this.finalizeWorkspace(tripId, workspace, pipelineResult.problem);
  }

  async evaluateAndFinalizeByProblemId(
    tripId: string,
    problemId: string,
  ): Promise<ExcessiveDailyLoadRunResult> {
    const workspace = await this.evaluateService.evaluateByProblemId(tripId, problemId);
    const problem = await this.problemStore.get(tripId, problemId);
    if (!problem) {
      throw new NotFoundException(`Decision problem ${problemId} not found`);
    }
    return this.finalizeWorkspace(tripId, workspace, problem);
  }

  async finalizeByProblemId(
    tripId: string,
    problemId: string,
  ): Promise<ExcessiveDailyLoadRunResult> {
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
  ): Promise<ExcessiveDailyLoadRunResult> {
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

  private emptyRun(tripId: string): ExcessiveDailyLoadRunResult {
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
