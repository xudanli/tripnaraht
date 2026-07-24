/**
 * PR-D — Iceland road close: evidence → problem → workspace → Decision Core finalize → ledger.
 * Shadow mode writes ledger only; never switches effective plan (PR-E).
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import type { Rfc001DecisionProblem } from '../contracts/decision-problem.types';
import type { DecisionWorkspace } from '../contracts/decision-workspace.types';
import type { Rfc001DecisionRecord } from '../contracts/decision-record.types';
import type { RoadStatusChangedEvent } from '../evidence/road-status-changed.event';
import type { RoadSegmentBindings } from '../detection/road-close-impact.types';
import { isRfc001ShadowMode } from '../config/rfc001-iceland.config';
import { RoadSegmentUnavailablePipelineService } from '../detection/road-segment-unavailable-pipeline.service';
import { RoadSegmentUnavailableEvaluateService } from '../orchestration/road-segment-unavailable-evaluate.service';
import { DecisionWorkspaceService } from '../workspace/decision-workspace.service';
import { Rfc001DecisionProblemStoreService } from '../persistence/rfc001-decision-problem.store';
import {
  Rfc001DecisionLedgerStoreService,
  type Rfc001DecisionRun,
} from '../persistence/rfc001-decision-ledger.store';
import type { PlanVersion } from '../contracts/plan-version.types';
import { Rfc001DecisionFinalizeService } from './rfc001-decision-finalize.service';

export interface RoadSegmentUnavailableRunResult {
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
export class RoadSegmentUnavailableRunnerService {
  constructor(
    private readonly pipeline: RoadSegmentUnavailablePipelineService,
    private readonly evaluateService: RoadSegmentUnavailableEvaluateService,
    private readonly finalizeService: Rfc001DecisionFinalizeService,
    private readonly workspaceService: DecisionWorkspaceService,
    private readonly problemStore: Rfc001DecisionProblemStoreService,
    private readonly ledgerStore: Rfc001DecisionLedgerStoreService,
  ) {}

  async runFullFromEvent(
    event: RoadStatusChangedEvent,
    opts?: { bindings?: RoadSegmentBindings },
  ): Promise<RoadSegmentUnavailableRunResult> {
    const tripId = event.aggregateId;
    const pipelineResult = await this.pipeline.runFromEvent(event, opts);
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

  async evaluateAndFinalizeByProblemId(
    tripId: string,
    problemId: string,
    opts?: { bindings?: RoadSegmentBindings },
  ): Promise<RoadSegmentUnavailableRunResult> {
    const workspace = await this.evaluateService.evaluateByProblemId(
      tripId,
      problemId,
      opts,
    );
    const problem = await this.problemStore.get(tripId, problemId);
    if (!problem) {
      throw new NotFoundException(`Decision problem ${problemId} not found`);
    }
    return this.finalizeWorkspace(tripId, workspace, problem);
  }

  async finalizeByProblemId(
    tripId: string,
    problemId: string,
  ): Promise<RoadSegmentUnavailableRunResult> {
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

  async getRunDetail(
    tripId: string,
    runId: string,
  ): Promise<{
    run: Rfc001DecisionRun;
    workspace: DecisionWorkspace | undefined;
    record: Rfc001DecisionRecord | undefined;
    problem: Rfc001DecisionProblem | undefined;
  }> {
    const run = await this.ledgerStore.getRun(tripId, runId);
    if (!run) {
      throw new NotFoundException(`Decision run ${runId} not found`);
    }
    const [workspace, record, problem] = await Promise.all([
      this.workspaceService.get(tripId, run.workspaceId),
      this.ledgerStore.getDecision(tripId, run.decisionId),
      this.problemStore.get(tripId, run.problemId),
    ]);
    return { run, workspace, record, problem };
  }

  private async finalizeWorkspace(
    tripId: string,
    workspace: DecisionWorkspace,
    problem: Rfc001DecisionProblem,
  ): Promise<RoadSegmentUnavailableRunResult> {
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

  private emptyRun(tripId: string): RoadSegmentUnavailableRunResult {
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
