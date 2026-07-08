import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { randomUUID } from 'crypto';
import { FeasibilityReportService } from '../../trip-constraint-solver/services/feasibility-report.service';
import type { PreviewRepairResponse, RepairOption } from '../../readiness/types/coverage-map.types';
import type {
  CreateDecisionRequestBody,
  CreateDecisionResponse,
  DecisionCenterOverview,
  DecisionOption,
  DecisionOptionPreviewResponse,
  DecisionOptionsResponse,
  DecisionOutcomeValidation,
  DecisionProblemDetail,
  DecisionProblemListMeta,
  DecisionProblemSummary,
  TradeoffDimension,
  TripMutationSet,
} from '../types/decision-semantics.types';
import { findIssueByProblemId, adaptFeasibilityIssueToProblem } from '../normalizers/from-feasibility-issue.adapter';
import { domainFromAssertion, resolveDecisionAuthority } from '../authority/decision-authority.matrix';
import {
  buildRequiredAcknowledgements,
  buildRequiredAcknowledgementsFromAuthority,
} from '../utils/decision-acknowledgement.util';
import {
  inferOptionRequiresConfirmation,
  normalizeRepairOptionTradeoffs,
} from '../normalizers/tradeoff.normalizer';
import { resolveOptionTradeoffsBatch } from '../normalizers/resolve-option-tradeoffs.util';
import type { FeasibilityIssueDto, TripFeasibilityReportDto } from '../../trip-constraint-solver/types/trip-constraint-solver.types';
import { DecisionProblemCollectorService } from '../collectors/decision-problem.collector';
import type { CollectedDecisionProblems } from '../collectors/decision-problem.collector';
import { DecisionSpaceOptionsCacheStore } from '../collectors/decision-space-options-cache.store';
import {
  buildSemanticImpactFromMutations,
  buildTripMutationSet,
} from '../mutation/trip-mutation.builder';
import { qualifiesForDecisionQueue, inferEnforcementForQueue } from '../../../decision-runtime/gateway/utils/decision-queue-admission.util';
import { DecisionRecordStoreService } from '../persistence/decision-record.store';
import { DecisionRepairExecutorService } from './decision-repair-executor.service';
import { DecisionOutcomeValidationService } from './decision-outcome-validation.service';
import { DecisionLedgerBridgeService } from '../ledger/decision-ledger-bridge.service';
import type { ApplyRepairResponse } from '../../readiness/types/coverage-map.types';
import { buildGateRepairOptions } from '../repair/gate-repair-recipes.util';
import { enrichDecisionOptionWithExecution } from '../repair/build-repair-command.util';
import { resolveDecisionExecutionStatus } from '../execution/decision-execution-status.util';
import { buildDecisionExecutionStatusResponse } from '../execution/decision-execution-status-response.util';
import { buildDecisionCenterOverview } from '../read/decision-center-overview.util';
import { toProblemResolutionSummary } from '../read/apply-problem-resolution.util';
import { assessDecisionRepairEvidenceFreshness } from '../policy/decision-evidence-freshness-policy.util';
import { projectAffectedScopeDisplays } from '../read/affected-scope-display.util';
import { planBActionLabelZh } from '../../../poi-access-capacity/utils/plan-b-action-label.util';
import { projectDecisionOptionsForSpaceView } from '../projections/decision-space-option-projection.util';
import { DecisionProblemNegotiationOrchestratorService } from '../../process-fairness/services/decision-problem-negotiation-orchestrator.service';
import {
  EffectivePlanWriteGuardService,
} from '../../../decision-runtime/execution/effective-plan-write-guard.service';

export interface DecisionGetOptionsOpts {
  /** When false, skip previewRepair tradeoff enrichment (use POST preview for full deltas). Default false. */
  enrichTradeoffs?: boolean;
  preloadedCollected?: CollectedDecisionProblems;
}

@Injectable()
export class DecisionSemanticsService {
  private readonly optionsProjectionCache = new DecisionSpaceOptionsCacheStore();

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly collector: DecisionProblemCollectorService,
    private readonly feasibility: FeasibilityReportService,
    private readonly recordStore: DecisionRecordStoreService,
    private readonly repairExecutor: DecisionRepairExecutorService,
    private readonly outcomeValidation: DecisionOutcomeValidationService,
    private readonly ledgerBridge: DecisionLedgerBridgeService,
    @Optional() private readonly effectivePlanWriteGuard?: EffectivePlanWriteGuardService,
  ) {}

  invalidateOptionsCache(tripId: string): void {
    this.optionsProjectionCache.clearTrip(tripId);
  }

  async listProblems(tripId: string): Promise<{ meta: DecisionProblemListMeta; items: DecisionProblemSummary[] }> {
    const collected = await this.collector.collect(tripId);
    const byType: DecisionProblemListMeta['byType'] = {};
    const byStatus: DecisionProblemListMeta['byStatus'] = {};

    const items: DecisionProblemSummary[] = collected.items
      .map((detail) => {
        const primary = detail.assertions[0];
        return {
          id: detail.id,
          type: detail.type,
          title: detail.title,
          status: detail.status,
          detectedBy: detail.detectedBy,
          primaryEnforcement: primary?.enforcement,
          semanticKey: detail.semanticKey,
          affectedDayNumbers: detail.affectedScope
            .filter((s) => s.scopeType === 'DAY')
            .map((s) => Number(s.scopeId))
            .filter((n) => Number.isFinite(n)),
        };
      })
      .filter((item) => {
        const enforcement = inferEnforcementForQueue(item.primaryEnforcement ?? 'INFORM', {
          semanticKey: item.semanticKey,
          title: item.title,
          summary: item.title,
        });
        return qualifiesForDecisionQueue({
          enforcement,
          workflowStatus: item.status,
          semanticKey: item.semanticKey,
          title: item.title,
          summary: item.title,
          blocksPlan: enforcement === 'BLOCK',
          requiresAdjustment: enforcement === 'REQUIRE_ADJUSTMENT',
          requiresConfirmation: enforcement === 'REQUIRE_CONFIRMATION',
        });
      });

    for (const item of items) {
      byType[item.type] = (byType[item.type] ?? 0) + 1;
      byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
    }

    return {
      meta: {
        tripId,
        tripVersion: collected.tripVersion,
        total: items.length,
        byType,
        byStatus,
        generatedAt: new Date().toISOString(),
      },
      items,
    };
  }

  async getOverview(tripId: string): Promise<DecisionCenterOverview> {
    const collected = await this.collector.collect(tripId);
    const { items } = await this.listProblems(tripId);
    const report = collected.feasibilityReport;

    const actionableProblemIds = new Set<string>();
    for (const detail of collected.items) {
      if (!['OPEN', 'WAITING_DECISION', 'ASSESSING'].includes(detail.status)) continue;
      const issue = this.resolveIssueForProblem(collected, detail, detail.id);
      const primary = detail.assertions[0];
      const enforcement = primary?.enforcement ?? 'INFORM';
      if (
        issue?.repairOptions?.length ||
        detail.detectedBy === 'GATE' ||
        enforcement === 'REQUIRE_ADJUSTMENT' ||
        enforcement === 'BLOCK' ||
        enforcement === 'REQUIRE_CONFIRMATION'
      ) {
        actionableProblemIds.add(detail.id);
      }
    }

    const recentRecords = await this.recordStore.listRecords(tripId);

    return buildDecisionCenterOverview({
      tripId,
      tripVersion: collected.tripVersion,
      items,
      details: collected.items,
      feasibility: report
        ? {
            verdict: report.verdict?.status ?? report.verdict?.headline,
            overallScore: report.overallScore,
            canStartExecute: report.canStartExecute,
            mustHandleCount: report.issues.filter((i) => i.priority === 'must_handle').length,
          }
        : undefined,
      recentRecords,
      actionableProblemIds,
    });
  }

  async getProblem(
    tripId: string,
    problemId: string,
    options?: { userId?: string; focusConflictId?: string },
  ): Promise<DecisionProblemDetail> {
    const collected = await this.collector.collect(tripId);
    const detail =
      collected.items.find((p) => p.id === problemId || p.semanticKey === problemId) ??
      collected.items.find((p) => p.sourceRefs.some((r) => r.refId === problemId));

    if (!detail) {
      throw new NotFoundException(`DECISION_PROBLEM_NOT_FOUND: ${problemId}`);
    }

    const issue = this.resolveIssueForProblem(collected, detail, problemId);
    const affectedScopeDisplay = projectAffectedScopeDisplays(detail.affectedScope, {
      issue,
      proofs: issue?.proofs,
      problemTitle: detail.title,
      problemDescription: detail.description,
    });
    const base: DecisionProblemDetail = {
      ...detail,
      affectedScopeDisplay,
    };

    return this.enrichWithNegotiationHints(tripId, problemId, base, options);
  }

  private async enrichWithNegotiationHints(
    tripId: string,
    problemId: string,
    detail: DecisionProblemDetail,
    options?: { userId?: string; focusConflictId?: string },
  ): Promise<DecisionProblemDetail> {
    if (!options?.userId) {
      return detail;
    }
    try {
      const orchestrator = this.moduleRef.get(DecisionProblemNegotiationOrchestratorService, {
        strict: false,
      });
      if (!orchestrator) {
        return detail;
      }
      const hints = await orchestrator.projectForProblemDetail(
        tripId,
        options.userId,
        problemId,
        options.focusConflictId,
      );
      if (!hints) {
        return detail;
      }
      return {
        ...detail,
        suggestedNegotiationDomain: hints.suggestedNegotiationDomain,
        suggestedDecisionNode: hints.suggestedDecisionNode,
        negotiation: hints.negotiation,
      };
    } catch {
      return detail;
    }
  }

  async getOptions(
    tripId: string,
    problemId: string,
    opts?: DecisionGetOptionsOpts,
  ): Promise<DecisionOptionsResponse> {
    const enrichTradeoffs = opts?.enrichTradeoffs === true;
    const collected = opts?.preloadedCollected ?? (await this.collector.collect(tripId));
    const revisionKey = collected.tripVersion;

    if (!enrichTradeoffs) {
      const cached = this.optionsProjectionCache.get(tripId, problemId, revisionKey);
      if (cached) {
        return {
          problemId,
          tripId,
          options: cached,
          generatedAt: new Date().toISOString(),
        };
      }
    }

    const detail =
      collected.items.find((p) => p.id === problemId || p.semanticKey === problemId) ??
      collected.items.find((p) => p.sourceRefs.some((r) => r.refId === problemId));

    if (!detail) {
      throw new NotFoundException(`DECISION_PROBLEM_NOT_FOUND: ${problemId}`);
    }

    const issue = this.resolveIssueForProblem(collected, detail, problemId);
    const primaryAssertion = detail.assertions[0];
    if (!primaryAssertion) {
      throw new NotFoundException(`DECISION_ASSERTION_MISSING: ${problemId}`);
    }

    const options = issue
      ? await this.buildOptionsFromIssue(
          tripId,
          detail,
          issue,
          primaryAssertion,
          collected.feasibilityReport,
          enrichTradeoffs,
        )
      : this.buildFallbackOptions(detail, primaryAssertion, collected.feasibilityIssues);

    if (!enrichTradeoffs) {
      this.optionsProjectionCache.put(tripId, problemId, revisionKey, options);
    }

    return {
      problemId: detail.id,
      tripId,
      options,
      generatedAt: new Date().toISOString(),
    };
  }

  async buildOptionsForFeasibilityIssue(
    tripId: string,
    issue: FeasibilityIssueDto,
    opts?: { preloadedCollected?: CollectedDecisionProblems },
  ): Promise<DecisionOption[]> {
    const collected = opts?.preloadedCollected ?? (await this.collector.collect(tripId));
    const { problem, assertion } = adaptFeasibilityIssueToProblem(
      issue,
      tripId,
      collected.tripVersion,
      collected.detectedAt,
    );
    const detail: DecisionProblemDetail = {
      ...problem,
      assertions: [assertion],
      affectedScopeDisplay: projectAffectedScopeDisplays(problem.affectedScope, {
        issue,
        proofs: issue.proofs,
        problemTitle: problem.title,
      }),
    };
    return this.buildOptionsFromIssue(
      tripId,
      detail,
      issue,
      assertion,
      collected.feasibilityReport,
      false,
    );
  }

  async previewOption(
    tripId: string,
    problemId: string,
    optionId: string,
    userId: string,
  ): Promise<DecisionOptionPreviewResponse> {
    const detail = await this.getProblem(tripId, problemId);
    const optionsResp = await this.getOptions(tripId, problemId, { enrichTradeoffs: true });
    const optionMeta = optionsResp.options.find((o) => o.id === optionId);
    if (!optionMeta) {
      throw new NotFoundException(`DECISION_OPTION_NOT_FOUND: ${optionId}`);
    }

    const collected = await this.collector.collect(tripId);
    const issue = this.resolveIssueForProblem(collected, detail, problemId);
    const versionBefore = collected.tripVersion;

    let repairOption: RepairOption | undefined;
    let repairPreview: PreviewRepairResponse | Record<string, unknown> | undefined;

    if (issue && !optionId.startsWith('planb_')) {
      const repairs = await this.feasibility.getRepairOptions(tripId, issue.id).catch(() => undefined);
      repairOption = repairs?.options.find((o) => o.id === optionId);
      if (repairOption) {
        try {
          repairPreview = await this.feasibility.previewRepair(tripId, issue.id, {
            optionId,
            runGuardianNegotiation: false,
          });
        } catch {
          repairPreview = undefined;
        }
      }
    }

    if (!repairOption) {
      repairOption = {
        id: optionId,
        title: optionMeta.title,
        description: optionMeta.description,
        impact: 'medium',
        actionType: optionMeta.type,
      };
    }

    const tradeoffs = normalizeRepairOptionTradeoffs(repairOption, issue, repairPreview);

    const proposedMutations = buildTripMutationSet({
      tripId,
      versionBefore,
      createdBy: userId,
      option: repairOption,
      issue,
      tradeoffs,
      preview: repairPreview,
    });

    const authority =
      optionMeta.authority ??
      resolveDecisionAuthority({
        problemType: detail.type,
        primaryDomain: domainFromAssertion(detail.assertions[0]),
        enforcement: detail.assertions[0].enforcement,
        overridable: detail.assertions[0].overridable,
        issueKind: issue?.issueKind,
      });

    return {
      problemId: detail.id,
      optionId,
      tripId,
      predictedImpact: buildSemanticImpactFromMutations(proposedMutations.operations, issue),
      tradeoffs,
      proposedMutations,
      authority,
      requiredAcknowledgements: buildRequiredAcknowledgements({
        requiresConfirmation: optionMeta.requiresConfirmation,
        enforcement: detail.assertions[0]?.enforcement ?? 'WARN',
        detail,
      }),
      repairCommand: optionMeta.repairCommand,
      executionCapability: optionMeta.executionCapability,
      repairPreview: repairPreview as Record<string, unknown> | undefined,
      generatedAt: new Date().toISOString(),
    };
  }

  async createDecision(
    tripId: string,
    userId: string,
    body: CreateDecisionRequestBody,
  ): Promise<CreateDecisionResponse> {
    const idempotencyKey = body.idempotencyKey?.trim();
    if (idempotencyKey) {
      const existing = await this.recordStore.findEffectiveByIdempotencyKey(tripId, idempotencyKey);
      if (
        existing &&
        existing.problemId === body.problemId &&
        existing.selectedOptionId === body.selectedOptionId
      ) {
        const audit = this.recordStore.buildRecord({
          tripId,
          problemId: body.problemId,
          selectedOptionId: body.selectedOptionId,
          rejectedOptionIds: body.rejectedOptionIds,
          authoritySnapshot: existing.authoritySnapshot,
          reasons: [
            ...(body.reason ? [{ text: body.reason, source: 'USER' as const }] : []),
            { text: 'IDEMPOTENT_REPLAY', source: 'SYSTEM' as const },
          ],
          tripVersionBefore: existing.tripVersionBefore,
          tripVersionAfter: existing.tripVersionAfter,
          predictedImpact: existing.predictedImpact,
          actualMutation: existing.actualMutation,
          status: 'SUPERSEDED',
        });
        audit.idempotencyKey = idempotencyKey;
        audit.effectiveDecisionId = existing.id;
        audit.recordKind = 'IDEMPOTENT_REPLAY_AUDIT';
        audit.validationStatus = 'NOT_APPLICABLE';
        await this.recordStore.appendRecord(tripId, audit);

        return {
          decision: audit,
          tripVersionAfter: existing.tripVersionAfter,
          appliedMutations: existing.actualMutation,
          executionStatus: 'IDEMPOTENT_REPLAY',
          idempotentReplay: true,
          effectiveDecisionId: existing.id,
          needsRepair: existing.needsRepair,
          postApplyCoherence: existing.postApplyCoherence,
        };
      }
    }

    const preview = await this.previewOption(tripId, body.problemId, body.selectedOptionId, userId);
    const detail = await this.getProblem(tripId, body.problemId);
    const collected = await this.collector.collect(tripId);
    const issue = this.resolveIssueForProblem(collected, detail, body.problemId);
    const optionsResp = await this.getOptions(tripId, body.problemId, {
      enrichTradeoffs: true,
      preloadedCollected: collected,
    });
    const optionMeta = optionsResp.options.find((o) => o.id === body.selectedOptionId);

    if (
      preview.authority.overridable === false &&
      preview.authority.executionMode === 'EXPLICIT_CONFIRMATION' &&
      !body.acknowledgement?.length
    ) {
      const authorityAcks = buildRequiredAcknowledgementsFromAuthority(preview.authority);
      const requiredAcknowledgements = [
        ...authorityAcks,
        ...(optionMeta?.requiresConfirmation && !authorityAcks.length
          ? ['我确认已阅读方案说明并同意应用该修复']
          : []),
      ];
      throw new BadRequestException({
        message: 'DECISION_ACKNOWLEDGEMENT_REQUIRED',
        details: { requiredAcknowledgements },
      });
    }

    let status: CreateDecisionResponse['decision']['status'] = 'PROPOSED';
    if (preview.authority.executionMode === 'AUTO' || preview.authority.executionMode === 'AUTO_WITH_NOTIFICATION') {
      status = 'APPROVED';
    } else if (
      preview.authority.overridable &&
      body.acknowledgement?.length &&
      preview.authority.requiredApprover === 'TRIP_OWNER'
    ) {
      status = 'APPROVED';
    } else if (
      body.acknowledgement?.length &&
      preview.authority.executionMode === 'EXPLICIT_CONFIRMATION' &&
      preview.authority.requiredApprover === 'TRIP_OWNER'
    ) {
      // REQUIRE_ADJUSTMENT / ROUTE_ADJUST: overridable=false but ack collected on submit
      status = 'APPROVED';
    } else if (body.acknowledgement?.length && optionMeta?.requiresConfirmation) {
      status = 'APPROVED';
    }

    const shouldExecute = body.execute !== false && status === 'APPROVED';
    let tripVersionAfter: string | undefined;
    let applyResult: CreateDecisionResponse['applyResult'];
    let postApplyCoherence: CreateDecisionResponse['postApplyCoherence'];
    let needsRepair = false;
    let actualMutation: TripMutationSet = attachTradeoffsToMutation(
      preview.proposedMutations,
      preview.tradeoffs,
    );
    const ledgerBefore = shouldExecute ? await this.ledgerBridge.loadLedgerContext(tripId) : null;

    const evidenceFreshnessVerdict = assessDecisionRepairEvidenceFreshness({
      proofs: detail.assertions.flatMap((a) => a.proofs),
    });
    const evidenceFreshnessBlock = evidenceFreshnessVerdict.blocked ? evidenceFreshnessVerdict : undefined;

    if (
      shouldExecute &&
      !evidenceFreshnessVerdict.blocked &&
      this.repairExecutor.canExecuteRepair(body.selectedOptionId, issue)
    ) {
      const runRepair = () =>
        this.repairExecutor.executeRepair({ tripId, userId, issue: issue!, body });
      const exec = this.effectivePlanWriteGuard
        ? await this.effectivePlanWriteGuard.runWithAuthority('execute', runRepair)
        : await runRepair();
      if (exec.applyResult) {
        const ar = exec.applyResult as ApplyRepairResponse;
        applyResult = {
          status: ar.status,
          message: ar.message,
          actionType: ar.actionType,
          persisted: ar.persisted ?? ar.persistence?.applied,
          blockerId: ar.blockerId,
        };
      }
      postApplyCoherence = exec.postApplyCoherence;
      needsRepair = exec.postApplyCoherence?.needsRepair === true;
      if (exec.postApplyCoherence?.outcome === 'ROLLED_BACK') {
        status = 'ROLLED_BACK';
        tripVersionAfter = undefined;
      } else if (exec.applied) {
        status = exec.postApplyCoherence?.outcome === 'PARTIALLY_APPLIED' ? 'PARTIALLY_APPLIED' : 'EXECUTED';
        tripVersionAfter = await this.collector.resolveTripVersion(tripId);
        actualMutation = {
          ...actualMutation,
          versionAfter: tripVersionAfter,
          ...(exec.mutationsPatch?.operations?.length
            ? { operations: [...actualMutation.operations, ...exec.mutationsPatch.operations] }
            : {}),
        };
      } else if (exec.applyResult && (exec.applyResult as ApplyRepairResponse).status === 'deferred') {
        status = 'APPROVED';
      }
    } else if (shouldExecute && evidenceFreshnessVerdict.blocked) {
      applyResult = {
        status: 'blocked',
        message: evidenceFreshnessVerdict.message ?? 'DATA_STALE: evidence refresh required',
        blockerId: 'DATA_STALE',
      };
    } else if (
      shouldExecute &&
      !evidenceFreshnessVerdict.blocked &&
      this.repairExecutor.canExecuteGateRepair(
        body.selectedOptionId,
        detail,
        collected.feasibilityIssues,
      )
    ) {
      const exec = await this.repairExecutor.executeGateRepair({
        tripId,
        userId,
        body,
        detail,
        feasibilityIssues: collected.feasibilityIssues,
      });
      if (exec.applyResult) {
        const ar = exec.applyResult as ApplyRepairResponse;
        applyResult = {
          status: ar.status,
          message: ar.message,
          actionType: ar.actionType,
          persisted: ar.persisted ?? ar.persistence?.applied,
          blockerId: ar.blockerId,
        };
      }
      postApplyCoherence = exec.postApplyCoherence;
      needsRepair = exec.postApplyCoherence?.needsRepair === true;
      if (exec.postApplyCoherence?.outcome === 'ROLLED_BACK') {
        status = 'ROLLED_BACK';
        tripVersionAfter = undefined;
      } else if (exec.applied) {
        status = exec.postApplyCoherence?.outcome === 'PARTIALLY_APPLIED' ? 'PARTIALLY_APPLIED' : 'EXECUTED';
        tripVersionAfter = await this.collector.resolveTripVersion(tripId);
        actualMutation = {
          ...actualMutation,
          versionAfter: tripVersionAfter,
          ...(exec.mutationsPatch?.operations?.length
            ? { operations: [...actualMutation.operations, ...exec.mutationsPatch.operations] }
            : {}),
        };
      } else if (exec.applyResult && (exec.applyResult as ApplyRepairResponse).status === 'deferred') {
        status = 'APPROVED';
      }
    }

    const decision = this.recordStore.buildRecord({
      tripId,
      problemId: detail.id,
      selectedOptionId: body.selectedOptionId,
      rejectedOptionIds: body.rejectedOptionIds,
      authoritySnapshot: preview.authority,
      reasons: [
        ...(body.reason ? [{ text: body.reason, source: 'USER' as const }] : []),
        ...(body.acknowledgement?.map((a) => ({ text: a, source: 'USER' as const })) ?? []),
        ...(evidenceFreshnessBlock
          ? [
              {
                code: 'DATA_STALE',
                text: evidenceFreshnessBlock.message ?? 'DATA_STALE',
                source: 'POLICY' as const,
              },
            ]
          : []),
      ],
      tripVersionBefore: preview.proposedMutations.versionBefore,
      tripVersionAfter,
      predictedImpact: preview.predictedImpact,
      actualMutation,
      status,
    });
    if (idempotencyKey) {
      decision.idempotencyKey = idempotencyKey;
      decision.recordKind = 'EFFECTIVE';
    }

    decision.actualMutation = {
      ...actualMutation,
      sourceDecisionId: decision.id,
    };
    decision.postApplyCoherence = postApplyCoherence;
    decision.needsRepair = needsRepair || undefined;

    if (status === 'EXECUTED') {
      const baselinePatch = await this.outcomeValidation.capturePostDecisionBaseline(tripId, decision);
      Object.assign(decision, baselinePatch);
      decision.ledgerRefs = await this.ledgerBridge.captureLedgerRefs({
        tripId,
        decisionId: decision.id,
        problem: detail,
        decidedAt: decision.decidedAt,
        ledgerBefore,
      });
      if (decision.ledgerRefs) {
        decision.ledgerRefs = await this.ledgerBridge.persistDecisionCausality(
          tripId,
          decision.id,
          decision.ledgerRefs,
        );
      }
    }

    const ledgerCausality =
      decision.ledgerRefs?.causedByAnnotatedNodeIds?.reduce(
        (acc, nodeId) => {
          acc[nodeId] = decision.id;
          return acc;
        },
        {} as Record<string, string>,
      ) ?? undefined;

    const saved = await this.recordStore.appendRecord(tripId, decision, {
      ledgerCausality,
    });

    let problemResolution: CreateDecisionResponse['problemResolution'];
    if (status === 'EXECUTED') {
      const resolution = await this.recordStore.markProblemResolved(tripId, {
        problemId: detail.id,
        semanticKey: detail.semanticKey ?? detail.id,
        resolvedAt: saved.decidedAt,
        resolvedByDecisionId: saved.id,
        resolvedTripVersion: tripVersionAfter ?? saved.tripVersionBefore,
        resolution: 'DECISION_EXECUTED',
      });
      problemResolution = toProblemResolutionSummary(resolution);
    }

    return {
      decision: saved,
      tripVersionAfter,
      appliedMutations: saved.actualMutation,
      applyResult,
      executionStatus: resolveDecisionExecutionStatus({ record: saved, applyResult }),
      idempotentReplay: false,
      problemResolution,
      postApplyCoherence,
      needsRepair: needsRepair || undefined,
      evidenceFreshnessBlock,
    };
  }

  async getDecision(tripId: string, decisionId: string) {
    const record = await this.recordStore.getRecord(tripId, decisionId);
    if (!record) {
      throw new NotFoundException(`DECISION_RECORD_NOT_FOUND: ${decisionId}`);
    }
    return record;
  }

  async resolveDecisionForLedgerNode(tripId: string, ledgerNodeId: string) {
    const fromIndex = await this.recordStore.resolveDecisionForLedgerNode(tripId, ledgerNodeId);
    if (fromIndex) {
      return fromIndex;
    }

    const decisionId = await this.ledgerBridge.resolveDecisionForLedgerNode(tripId, ledgerNodeId);
    if (!decisionId) {
      throw new NotFoundException(`DECISION_NOT_FOUND_FOR_LEDGER_NODE: ${ledgerNodeId}`);
    }

    const record = await this.recordStore.getRecord(tripId, decisionId);
    return { decisionId, record };
  }

  async getDecisionValidation(tripId: string, decisionId: string): Promise<DecisionOutcomeValidation> {
    return this.outcomeValidation.validateDecision(tripId, decisionId);
  }

  async getDecisionExecutionStatus(tripId: string, decisionId: string) {
    const record = await this.getDecision(tripId, decisionId);
    let validationVerdict = record.lastOutcomeValidation?.verdict;
    if (record.status === 'EXECUTED' && record.validationStatus === 'PENDING') {
      try {
        const validation = await this.getDecisionValidation(tripId, decisionId);
        validationVerdict = validation.verdict;
      } catch {
        // keep cached verdict only
      }
    }

    return buildDecisionExecutionStatusResponse({
      record,
      validationVerdict,
    });
  }

  private resolveIssueForProblem(
    collected: Awaited<ReturnType<DecisionProblemCollectorService['collect']>>,
    detail: DecisionProblemDetail,
    problemId: string,
  ): FeasibilityIssueDto | undefined {
    const fromMap =
      collected.issueByProblemId.get(detail.id) ??
      collected.issueByProblemId.get(problemId);
    if (fromMap) return fromMap;

    const feasibilityRef = detail.sourceRefs.find((r) => r.system === 'FEASIBILITY');
    if (feasibilityRef) {
      return findIssueByProblemId(collected.feasibilityIssues, feasibilityRef.refId);
    }
    return findIssueByProblemId(collected.feasibilityIssues, problemId);
  }

  private async buildOptionsFromIssue(
    tripId: string,
    detail: DecisionProblemDetail,
    issue: FeasibilityIssueDto,
    primaryAssertion: DecisionProblemDetail['assertions'][0],
    preloadedReport?: TripFeasibilityReportDto,
    enrichTradeoffs = false,
  ): Promise<DecisionOption[]> {
    let repairOptions: Awaited<ReturnType<FeasibilityReportService['getRepairOptions']>> | undefined;
    try {
      repairOptions = await this.feasibility.getRepairOptions(tripId, issue.id, {
        preloadedReport,
      });
    } catch {
      repairOptions = undefined;
    }

    const merged = mergeRepairSources(repairOptions?.options ?? [], issue.repairOptions ?? [], issue);
    const tradeoffByOptionId = enrichTradeoffs
      ? await resolveOptionTradeoffsBatch(this.feasibility, tripId, issue, merged, {
          preloadedReport,
          preloadedRepairOptions: repairOptions,
        })
      : new Map(
          merged.map(
            (opt) => [opt.id, normalizeRepairOptionTradeoffs(opt, issue)] as const,
          ),
        );

    const options: DecisionOption[] = merged.map((opt, index) => {
      const tradeoffs = tradeoffByOptionId.get(opt.id) ?? normalizeRepairOptionTradeoffs(opt, issue);
      const requiresConfirmation =
        inferOptionRequiresConfirmation(tradeoffs, issue) ||
        primaryAssertion.enforcement === 'REQUIRE_CONFIRMATION' ||
        primaryAssertion.enforcement === 'BLOCK';

      const authority = resolveDecisionAuthority({
        problemType: detail.type,
        primaryDomain: domainFromAssertion(primaryAssertion),
        enforcement: primaryAssertion.enforcement,
        overridable: primaryAssertion.overridable,
        issueKind: issue.issueKind,
      });

      const base: DecisionOption = {
        id: opt.id ?? `opt_${index}`,
        problemId: detail.id,
        type: inferOptionType(opt.actionType),
        title: opt.title,
        description: opt.description ?? '',
        source: 'CONSTRAINT_REPAIR',
        resolves: detail.assertionIds,
        tradeoffs,
        executable:
          primaryAssertion.enforcement !== 'BLOCK' ||
          primaryAssertion.overridable ||
          inferOptionType(opt.actionType) !== 'ACCEPT_RISK',
        requiresConfirmation,
        authority,
        sourceRefId: opt.id,
      };

      return enrichDecisionOptionWithExecution({
        option: base,
        tripVersion: detail.tripVersion,
        detail,
        issue,
        repairOption: opt,
        canExecuteRepair: this.repairExecutor.canExecuteRepair(base.id, issue),
      });
    });

    if (issue.visitorAccess?.evaluation.planBHints?.length) {
      for (const [idx, hint] of issue.visitorAccess.evaluation.planBHints.entries()) {
        const payload: Record<string, unknown> = {
          alternativePoiId: hint.alternativePoiId,
          planBAction: hint.action,
        };
        if (hint.action === 'BOOK_NOW') {
          const urlMatch = hint.detail?.match(/https?:\/\/[^\s）)]+/);
          if (urlMatch?.[0]) {
            payload.externalUrl = urlMatch[0];
          }
        }
        const planB: DecisionOption = {
          id: `planb_${idx}_${issue.id}`,
          problemId: detail.id,
          type: 'PLAN_B',
          title: planBActionLabelZh(hint.action, hint.detail),
          description: hint.detail,
          source: 'RULE_ENGINE',
          resolves: detail.assertionIds,
          tradeoffs: [
            {
              dimension: 'POI_COVERAGE',
              direction: hint.alternativePoiId ? 'UNCHANGED' : 'WORSEN',
              explanation: hint.detail,
            },
          ],
          executable: true,
          requiresConfirmation: true,
          sourceRefId: hint.alternativePoiId,
        };
        options.push(
          enrichDecisionOptionWithExecution({
            option: planB,
            tripVersion: detail.tripVersion,
            detail,
            issue,
            repairOption: {
              id: planB.id,
              title: planB.title,
              description: planB.description,
              impact: 'medium',
              payload,
            },
            canExecuteRepair: false,
          }),
        );
      }
    }

    const repairOptionsById = new Map(merged.map((opt) => [opt.id, opt] as const));

    return projectDecisionOptionsForSpaceView(options, {
      issue,
      affectedScopeDisplay: detail.affectedScopeDisplay,
      repairOptionsById,
    });
  }

  private buildFallbackOptions(
    detail: DecisionProblemDetail,
    primaryAssertion: DecisionProblemDetail['assertions'][0],
    feasibilityIssues: FeasibilityIssueDto[],
  ): DecisionOption[] {
    const isGateProblem =
      detail.detectedBy === 'GATE' ||
      primaryAssertion.sourceSystem === 'GATE' ||
      detail.semanticKey?.startsWith('gate:');

    if (isGateProblem) {
      const gateOptions = buildGateRepairOptions(detail, primaryAssertion);
      if (gateOptions.length) {
        return gateOptions.map((opt) =>
          enrichDecisionOptionWithExecution({
            option: {
              ...opt,
              authority:
                detail.authority ??
                resolveDecisionAuthority({
                  problemType: detail.type,
                  primaryDomain: domainFromAssertion(primaryAssertion),
                  enforcement: primaryAssertion.enforcement,
                  overridable: primaryAssertion.overridable,
                }),
            },
            tripVersion: detail.tripVersion,
            detail,
            canExecuteRepair: false,
            canExecuteGateRepair: this.repairExecutor.canExecuteGateRepair(
              opt.id,
              detail,
              feasibilityIssues,
            ),
          }),
        );
      }
    }

    const ackBase: DecisionOption = {
      id: `ack_${randomUUID().slice(0, 8)}`,
      problemId: detail.id,
      type: 'ACCEPT_RISK',
      title: '确认并继续评估',
      description: detail.description,
      source: 'RULE_ENGINE',
      resolves: detail.assertionIds,
      tradeoffs: [],
      executable: primaryAssertion.overridable,
      requiresConfirmation: true,
      authority:
        detail.authority ??
        resolveDecisionAuthority({
          problemType: detail.type,
          primaryDomain: domainFromAssertion(primaryAssertion),
          enforcement: primaryAssertion.enforcement,
          overridable: primaryAssertion.overridable,
        }),
    };

    return [
      enrichDecisionOptionWithExecution({
        option: ackBase,
        tripVersion: detail.tripVersion,
        detail,
        canExecuteRepair: false,
      }),
    ];
  }
}

function mergeRepairSources(
  fromApi: RepairOption[],
  embedded: FeasibilityIssueDto['repairOptions'],
  issue: FeasibilityIssueDto,
): RepairOption[] {
  const byId = new Map<string, RepairOption>();
  for (const o of fromApi) {
    byId.set(o.id, o);
  }
  for (const e of embedded ?? []) {
    byId.set(e.id, {
      id: e.id,
      title: e.label,
      description: e.description,
      impact: (['high', 'medium', 'low'].includes(String(e.impactSummary))
        ? e.impactSummary
        : 'medium') as RepairOption['impact'],
      actionType: e.actionType ?? e.type,
      payload: e.payload,
    });
  }
  if (!byId.size && issue.actionRequired) {
    byId.set('fallback_review', {
      id: 'fallback_review',
      title: '查看问题详情',
      description: issue.actionRequired,
      impact: 'medium',
    });
  }
  return [...byId.values()];
}

function inferOptionType(actionType?: string): DecisionOption['type'] {
  if (!actionType) return 'REPAIR';
  if (/accept|risk/i.test(actionType)) return 'ACCEPT_RISK';
  if (/cancel/i.test(actionType)) return 'CANCEL';
  if (/defer|wait/i.test(actionType)) return 'DEFER';
  if (/alternative|plan_b/i.test(actionType)) return 'ALTERNATIVE';
  return 'REPAIR';
}

function attachTradeoffsToMutation(
  base: TripMutationSet,
  tradeoffs: TradeoffDimension[],
): TripMutationSet {
  if (!tradeoffs.length) return { ...base };
  if (base.operations.length) {
    return {
      ...base,
      operations: base.operations.map((op, i) =>
        i === 0 ? { ...op, semanticEffects: tradeoffs } : op,
      ),
    };
  }
  return {
    ...base,
    operations: [
      {
        operation: 'UPDATE',
        entityType: 'TRIP',
        semanticEffects: tradeoffs,
      },
    ],
  };
}
