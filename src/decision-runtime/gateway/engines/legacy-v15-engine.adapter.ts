/**
 * RFC-002 — delegates to decision-semantics (Legacy V1.5 FALLBACK).
 */

import { Injectable } from '@nestjs/common';
import { DecisionSemanticsService, type DecisionGetOptionsOpts } from '../../../trips/decision-semantics/services/decision-semantics.service';
import { DecisionRecordStoreService } from '../../../trips/decision-semantics/persistence/decision-record.store';
import type { FeasibilityIssueDto } from '../../../trips/trip-constraint-solver/types/trip-constraint-solver.types';
import type { CollectedDecisionProblems } from '../../../trips/decision-semantics/collectors/decision-problem.collector';

@Injectable()
export class LegacyV15EngineAdapter {
  constructor(
    private readonly semantics: DecisionSemanticsService,
    private readonly recordStore: DecisionRecordStoreService,
  ) {}

  async getDecisionCenter(tripId: string) {
    return this.semantics.getOverview(tripId);
  }

  async getProblem(
    tripId: string,
    problemId: string,
    options?: { userId?: string; focusConflictId?: string },
  ) {
    return this.semantics.getProblem(tripId, problemId, options);
  }

  async listProblems(tripId: string) {
    return this.semantics.listProblems(tripId);
  }

  async getOptions(tripId: string, problemId: string, opts?: DecisionGetOptionsOpts) {
    return this.semantics.getOptions(tripId, problemId, opts);
  }

  async buildOptionsForFeasibilityIssue(
    tripId: string,
    issue: FeasibilityIssueDto,
    opts?: { preloadedCollected?: CollectedDecisionProblems },
  ) {
    return this.semantics.buildOptionsForFeasibilityIssue(tripId, issue, opts);
  }

  async previewOption(
    tripId: string,
    problemId: string,
    optionId: string,
    userId: string,
  ) {
    return this.semantics.previewOption(tripId, problemId, optionId, userId);
  }

  async ownsDecision(tripId: string, decisionId: string): Promise<boolean> {
    return Boolean(await this.recordStore.getRecord(tripId, decisionId));
  }
}
