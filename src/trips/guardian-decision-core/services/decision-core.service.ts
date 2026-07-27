/**
 * RFC-001 Phase 0 — Decision Core (sole decision authority).
 * Initial finalize: exclude BLOCK, require assessments, naive utility, L2 default for Iceland slice.
 */

import { Injectable, Logger } from '@nestjs/common';
import type { DecisionWorkspace } from '../contracts/decision-workspace.types';
import type { Rfc001DecisionRecord } from '../contracts/decision-record.types';
import type { AuthorizationRequirement } from '../contracts/authorization.types';
import { RFC001_REASON_CODES } from '../reason-codes/reason-code.registry';
import {
  assertWorkspaceReadyForFinalize,
  candidateHasNonOverridableBlock,
  candidateViolatesDecisionScope,
} from '../policy/write-permission.guard';

export interface FinalizeInput {
  workspace: DecisionWorkspace;
  currentWorldStateSnapshotId: string;
  /** Base plan as implicit candidate when no Neptune repairs */
  baseCandidateId?: string;
  /** Iceland MVP default: L2 draft requires confirmation */
  defaultAuthorizationLevel?: AuthorizationRequirement['level'];
  now?: string;
}

export interface FinalizeResult {
  record: Rfc001DecisionRecord;
  humanDecisionRequired: boolean;
}

const BASE_CANDIDATE_ID = 'original';

@Injectable()
export class DecisionCoreService {
  private readonly logger = new Logger(DecisionCoreService.name);

  /**
   * Form the sole formal decision from workspace materials.
   * Does NOT execute plan changes or switch effective pointer.
   */
  finalize(input: FinalizeInput): FinalizeResult {
    const {
      workspace,
      currentWorldStateSnapshotId,
      baseCandidateId = BASE_CANDIDATE_ID,
      defaultAuthorizationLevel = 'L2',
      now = new Date().toISOString(),
    } = input;

    assertWorkspaceReadyForFinalize(workspace, currentWorldStateSnapshotId);

    const candidateIds = this.collectCandidateIds(workspace, baseCandidateId);
    const rejectedCandidates: Rfc001DecisionRecord['rejectedCandidates'] = [];
    const feasible: string[] = [];

    for (const candidateId of candidateIds) {
      if (candidateHasNonOverridableBlock(workspace, candidateId)) {
        const assertions = workspace.constraintAssertions.filter(
          (a) => a.targetCandidateId === candidateId && a.verdict === 'BLOCK',
        );
        rejectedCandidates.push({
          candidateId,
          reasonCodes: [
            RFC001_REASON_CODES.CANDIDATE_BLOCKED_BY_HARD_CONSTRAINT,
            ...assertions.flatMap((a) => a.reasonCodes),
          ],
          rejectedBy: 'HARD_CONSTRAINT',
        });
        continue;
      }

      const hasAssessment = workspace.loadAssessments.some(
        (a) => a.targetCandidateId === candidateId,
      );
      const isBase = candidateId === baseCandidateId;
      if (!hasAssessment && !isBase) {
        rejectedCandidates.push({
          candidateId,
          reasonCodes: ['INCOMPLETE_ASSESSMENT'],
          rejectedBy: 'INCOMPLETE_ASSESSMENT',
        });
        continue;
      }

      const scopeGate = candidateViolatesDecisionScope(workspace, candidateId);
      if (scopeGate.violates) {
        rejectedCandidates.push({
          candidateId,
          reasonCodes: ['DECISION_SCOPE_VIOLATION', ...scopeGate.reasons],
          rejectedBy: 'POLICY',
        });
        continue;
      }

      feasible.push(candidateId);
    }

    const decisionId = `dec_${workspace.problemId}_${Date.now()}`;
    const reasonCodes: string[] = [];

    if (feasible.length === 0) {
      const record: Rfc001DecisionRecord = {
        decisionId,
        problemId: workspace.problemId,
        workspaceId: workspace.workspaceId,
        basePlanVersionId: workspace.basePlanVersionId,
        worldStateSnapshotId: workspace.worldStateSnapshotId,
        preferenceSnapshotId: workspace.preferenceSnapshotId,
        consideredCandidateIds: candidateIds,
        rejectedCandidates,
        finalAction: 'REJECT',
        reasonCodes: [RFC001_REASON_CODES.NO_FEASIBLE_REPAIR],
        evidenceRefs: this.collectEvidenceRefs(workspace),
        authorizationRequirement: this.buildAuth(defaultAuthorizationLevel, false),
        ruleVersions: this.collectRuleVersions(workspace),
        modelVersions: this.collectModelVersions(workspace),
        recordStatus: 'PROPOSED',
        createdAt: now,
        decidedAt: now,
      };
      return { record, humanDecisionRequired: false };
    }

    const ranked = this.rankFeasible(workspace, feasible, baseCandidateId);
    const top = ranked[0];
    const second = ranked[1];
    const preferenceGap = second
      ? top.score - second.score
      : Number.POSITIVE_INFINITY;
    const humanDecisionRequired =
      feasible.length > 1 && preferenceGap < 0.05;

    let finalAction: Rfc001DecisionRecord['finalAction'] = 'ALLOW';
    let selectedCandidateId = top.candidateId;

    if (top.candidateId !== baseCandidateId) {
      const repair = workspace.repairCandidates.find(
        (c) => c.candidateId === top.candidateId,
      );
      finalAction = repair ? 'REPLACE' : 'ADJUST';
    }

    if (humanDecisionRequired) {
      finalAction = 'DEFER_TO_HUMAN';
      reasonCodes.push(RFC001_REASON_CODES.USER_PREFERENCE_INSUFFICIENT);
      reasonCodes.push(RFC001_REASON_CODES.HUMAN_CONFIRMATION_REQUIRED);
      selectedCandidateId = top.candidateId;
    }

    const requiresConfirmation =
      defaultAuthorizationLevel === 'L2' || humanDecisionRequired;

    const record: Rfc001DecisionRecord = {
      decisionId,
      problemId: workspace.problemId,
      workspaceId: workspace.workspaceId,
      basePlanVersionId: workspace.basePlanVersionId,
      worldStateSnapshotId: workspace.worldStateSnapshotId,
      preferenceSnapshotId: workspace.preferenceSnapshotId,
      consideredCandidateIds: candidateIds,
      rejectedCandidates,
      selectedCandidateId,
      finalAction,
      reasonCodes,
      evidenceRefs: this.collectEvidenceRefs(workspace),
      utilityEvaluation: ranked.map((r) => ({
        candidateId: r.candidateId,
        utility: r.score,
        vector: r.vector,
      })),
      authorizationRequirement: this.buildAuth(
        defaultAuthorizationLevel,
        requiresConfirmation,
      ),
      ruleVersions: this.collectRuleVersions(workspace),
      modelVersions: this.collectModelVersions(workspace),
      recordStatus: 'PROPOSED',
      createdAt: now,
      decidedAt: now,
    };

    this.logger.debug(
      `finalize problem=${workspace.problemId} feasible=${feasible.length} action=${finalAction} human=${humanDecisionRequired}`,
    );

    return { record, humanDecisionRequired };
  }

  private collectCandidateIds(
    workspace: DecisionWorkspace,
    baseCandidateId: string,
  ): string[] {
    const repairIds = workspace.repairCandidates.map((c) => c.candidateId);
    return [baseCandidateId, ...repairIds];
  }

  private rankFeasible(
    workspace: DecisionWorkspace,
    feasible: string[],
    baseCandidateId: string,
  ): Array<{
    candidateId: string;
    score: number;
    vector: import('../contracts/authorization.types').UtilityVector;
  }> {
    return feasible
      .map((candidateId) => {
        const repair = workspace.repairCandidates.find(
          (c) => c.candidateId === candidateId,
        );
        const assessment = workspace.loadAssessments.find(
          (a) => a.targetCandidateId === candidateId,
        );
        const intentPreservation =
          repair?.estimatedIntentPreservation ??
          (candidateId === baseCandidateId ? 1 : 0.5);
        const fatigueCost = assessment
          ? (assessment.physicalLoad + assessment.scheduleStress) / 2
          : 0.3;
        const timeStress = assessment?.scheduleStress ?? 0.3;
        const monetaryCost = repair
          ? Math.min(1, repair.estimatedAddedCost.amount / 1000)
          : 0;
        const vector = {
          experienceValue: intentPreservation,
          intentPreservation,
          fatigueCost,
          monetaryCost,
          timeStress,
          residualRisk: 0.1,
          reversibility: repair ? 0.7 : 0.9,
        };
        const score =
          vector.intentPreservation * 0.35 +
          vector.experienceValue * 0.15 -
          vector.fatigueCost * 0.2 -
          vector.timeStress * 0.15 -
          vector.monetaryCost * 0.1 -
          vector.residualRisk * 0.05 +
          vector.reversibility * 0.1;
        return { candidateId, score, vector };
      })
      .sort((a, b) => b.score - a.score);
  }

  private buildAuth(
    level: AuthorizationRequirement['level'],
    requiresUserConfirmation: boolean,
  ): AuthorizationRequirement {
    return {
      level,
      requiresUserConfirmation,
      reasons: requiresUserConfirmation
        ? [RFC001_REASON_CODES.HUMAN_CONFIRMATION_REQUIRED]
        : [],
      externalSideEffects: [],
    };
  }

  private collectEvidenceRefs(workspace: DecisionWorkspace): string[] {
    const refs = new Set<string>();
    for (const a of workspace.constraintAssertions) {
      a.evidenceRefs.forEach((r) => refs.add(r));
    }
    for (const c of workspace.repairCandidates) {
      c.evidenceRefs.forEach((r) => refs.add(r));
    }
    return [...refs];
  }

  private collectRuleVersions(workspace: DecisionWorkspace): string[] {
    return [
      ...new Set(workspace.constraintAssertions.map((a) => a.ruleVersion)),
    ];
  }

  private collectModelVersions(
    workspace: DecisionWorkspace,
  ): Record<string, string> {
    const versions: Record<string, string> = {};
    for (const a of workspace.loadAssessments) {
      versions.drdre = a.modelVersion;
    }
    for (const c of workspace.repairCandidates) {
      versions.neptune = c.generatorVersion;
    }
    return versions;
  }
}
