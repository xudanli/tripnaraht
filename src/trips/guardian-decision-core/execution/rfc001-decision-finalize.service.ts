/**
 * Shared finalize orchestration for RFC-001 vertical slices (road, weather, …).
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import type { Rfc001DecisionProblem } from '../contracts/decision-problem.types';
import type { DecisionWorkspace } from '../contracts/decision-workspace.types';
import type { Rfc001DecisionRecord } from '../contracts/decision-record.types';
import type { PlanVersion } from '../contracts/plan-version.types';
import { isRfc001ShadowMode } from '../config/rfc001-iceland.config';
import { DecisionCoreService } from '../services/decision-core.service';
import { DecisionWorkspaceService } from '../workspace/decision-workspace.service';
import { Rfc001DecisionProblemStoreService } from '../persistence/rfc001-decision-problem.store';
import {
  Rfc001DecisionLedgerStoreService,
  type Rfc001DecisionRun,
} from '../persistence/rfc001-decision-ledger.store';
import { Rfc001PlanVersionService } from '../plan-version/plan-version.service';
import { Rfc001DecisionSemanticsProjectorService } from '../read-model/rfc001-decision-semantics-projector.service';
import { resolveRfc001ProblemSemanticKey } from '../../../decision-capabilities/problem-semantic';

export interface Rfc001DecisionFinalizeResult {
  runId: string;
  tripId: string;
  problem: Rfc001DecisionProblem;
  workspace: DecisionWorkspace;
  record: Rfc001DecisionRecord;
  planVersion: PlanVersion | null;
  humanDecisionRequired: boolean;
  shadowMode: boolean;
}

@Injectable()
export class Rfc001DecisionFinalizeService {
  private readonly logger = new Logger(Rfc001DecisionFinalizeService.name);

  constructor(
    private readonly decisionCore: DecisionCoreService,
    private readonly workspaceService: DecisionWorkspaceService,
    private readonly problemStore: Rfc001DecisionProblemStoreService,
    private readonly ledgerStore: Rfc001DecisionLedgerStoreService,
    private readonly planVersionService: Rfc001PlanVersionService,
    @Optional() private readonly v15Projector?: Rfc001DecisionSemanticsProjectorService,
  ) {}

  async finalizeWorkspace(
    tripId: string,
    workspace: DecisionWorkspace,
    problem: Rfc001DecisionProblem,
  ): Promise<Rfc001DecisionFinalizeResult> {
    const shadowMode = isRfc001ShadowMode();

    const { record, humanDecisionRequired } = this.decisionCore.finalize({
      workspace,
      currentWorldStateSnapshotId: workspace.worldStateSnapshotId,
      defaultAuthorizationLevel: 'L2',
    });

    await this.ledgerStore.appendDecision(tripId, record);

    if (this.v15Projector?.isEnabled()) {
      await this.v15Projector.upsertFromRfcRecord({
        tripId,
        record,
        semanticKey: resolveRfc001ProblemSemanticKey(problem),
      });
    }

    await this.workspaceService.markFinalized(tripId, workspace.workspaceId);

    const nextProblemStatus = humanDecisionRequired ? 'WAITING_HUMAN' : 'DECIDED';
    const updatedProblem = { ...problem, status: nextProblemStatus as Rfc001DecisionProblem['status'] };
    await this.problemStore.upsert(tripId, updatedProblem);

    const runId = `run_${record.decisionId}`;
    const run: Rfc001DecisionRun = {
      runId,
      tripId,
      problemId: problem.problemId,
      workspaceId: workspace.workspaceId,
      decisionId: record.decisionId,
      shadowMode,
      humanDecisionRequired,
      createdAt: new Date().toISOString(),
    };
    await this.ledgerStore.appendRun(tripId, run);
    await this.ledgerStore.setDecisionRef(tripId, {
      decisionId: record.decisionId,
      problemId: problem.problemId,
      workspaceId: workspace.workspaceId,
      runId,
      shadowMode,
    });

    let planVersion: PlanVersion | null = null;
    if (!shadowMode) {
      planVersion = await this.planVersionService.createPendingFromDecision({
        tripId,
        record,
        workspace,
        candidateId: record.selectedCandidateId,
      });
    }

    if (shadowMode) {
      this.logger.debug(
        `shadow mode: decision ${record.decisionId} persisted without plan mutation`,
      );
    }

    this.logger.debug(
      `finalize trip=${tripId} decision=${record.decisionId} action=${record.finalAction} shadow=${shadowMode}`,
    );

    return {
      runId,
      tripId,
      problem: updatedProblem,
      workspace: { ...workspace, status: 'FINALIZED' },
      record,
      planVersion,
      humanDecisionRequired,
      shadowMode,
    };
  }
}
