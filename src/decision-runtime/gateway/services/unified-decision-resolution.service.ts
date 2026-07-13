/**
 * Phase 3 — unified POST resolutions / apply for Decision Problem SSOT.
 */

import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { UnifiedDecisionProblemReadModelService } from './unified-decision-problem-read-model.service';
import { DecisionSemanticsService } from '../../../trips/decision-semantics/services/decision-semantics.service';
import { DecisionOutcomeValidationService } from '../../../trips/decision-semantics/services/decision-outcome-validation.service';
import { CanonicalDecisionEngineAdapter } from '../engines/canonical-decision-engine.adapter';
import {
  DecisionProblemResolutionStoreService,
  type StoredDecisionProblemResolution,
} from '../persistence/decision-problem-resolution.store';
import { buildPlanVersionIdempotencyKey } from '../../../trips/guardian-decision-core/plan-version/plan-version.service';
import type {
  ApplyDecisionProblemResponse,
  DecisionProblemApplyTaskResponse,
  StartDecisionProblemApplyResponse,
  SubmitDecisionProblemResolutionRequest,
  SubmitDecisionProblemResolutionResponse,
} from '../contracts/unified-decision-ui.types';
import {
  DECISION_APPLY_DEFERRED_POLL_INTERVAL_MS,
  DecisionProblemApplyDeferredStore,
  type DecisionProblemApplyDeferredTask,
} from '../persistence/decision-problem-apply-deferred.store';
import { isDecisionTriggerGatewayEnabled } from '../../trigger/decision-trigger.config';
import { DecisionTriggerGatewayService } from '../../trigger/decision-trigger.gateway.service';
import { evaluateRevalidationFromRows } from '../utils/decision-problem-revalidation.util';
import type { ConstraintAssertion } from '../../../trips/decision-semantics/types/decision-semantics.types';
import { buildSuggestedSubTasks } from '../utils/decision-collaborative-subtask-suggestions.util';
import { PlanningConflictsService } from '../../../trips/trip-constraint-solver/services/planning-conflicts.service';
import { DecisionProblemNegotiationOrchestratorService } from '../../../trips/process-fairness/services/decision-problem-negotiation-orchestrator.service';
import { DecisionCollaborativeSubTaskService } from './decision-collaborative-subtask.service';
import { negotiationTaskIdForProblem } from '../../../trips/process-fairness/utils/decision-problem-negotiation.store';
import { EffectivePlanWriteGuardService } from '../../execution/effective-plan-write-guard.service';
import { isPhase6NonCanonicalApplyBlocked } from '../../phase6-legacy-deprecation.config';
import { normalizeSubmitResolutionRequest } from '../utils/normalize-submit-resolution-request.util';
import {
  assertAcknowledgementsProvided,
  buildRequiredAcknowledgements,
} from '../utils/decision-acknowledgement.util';
import {
  CanonicalCausalTraceService,
  CausalTraceStaleError,
  type CausalTraceReference,
} from '../../../causal-protocol';

type ApplyResolutionOptions = {
  /** 跳过 collectRows revalidation（异步 apply 第二阶段再跑） */
  deferRevalidation?: boolean;
  causalTraceRef?: CausalTraceReference;
};

@Injectable()
export class UnifiedDecisionResolutionService {
  private readonly applyDeferredStore = new DecisionProblemApplyDeferredStore();

  constructor(
    private readonly readModel: UnifiedDecisionProblemReadModelService,
    private readonly semantics: DecisionSemanticsService,
    private readonly canonical: CanonicalDecisionEngineAdapter,
    private readonly resolutionStore: DecisionProblemResolutionStoreService,
    private readonly outcomeValidation: DecisionOutcomeValidationService,
    @Optional() private readonly triggerGateway?: DecisionTriggerGatewayService,
    @Optional() private readonly planningConflicts?: PlanningConflictsService,
    @Optional() private readonly negotiationOrchestrator?: DecisionProblemNegotiationOrchestratorService,
    @Optional() private readonly collaborativeSubTasks?: DecisionCollaborativeSubTaskService,
    @Optional() private readonly effectivePlanWriteGuard?: EffectivePlanWriteGuardService,
    @Optional() private readonly causalTrace?: CanonicalCausalTraceService,
  ) {}

  async submitResolution(
    tripId: string,
    problemId: string,
    userId: string,
    body: SubmitDecisionProblemResolutionRequest,
  ): Promise<SubmitDecisionProblemResolutionResponse> {
    const normalized = normalizeSubmitResolutionRequest(body);
    const idempotencyKey =
      normalized.idempotencyKey ??
      this.resolutionStore.buildIdempotencyKey(tripId, problemId, normalized.selectedActionId);
    const existing = await this.resolutionStore.findByIdempotencyKey(tripId, idempotencyKey);
    if (existing && existing.selectedActionId === normalized.selectedActionId) {
      if (normalized.acknowledgement?.length) {
        const updated = await this.resolutionStore.upsert(tripId, {
          ...existing,
          acknowledgement: normalized.acknowledgement,
          failureMessage: undefined,
          status:
            existing.status === 'FAILED' || existing.status === 'APPLYING'
              ? 'AUTHORIZED'
              : existing.status,
        });
        return this.buildSubmitReplayResponse(tripId, problemId, updated, userId);
      }
      return this.buildSubmitReplayResponse(tripId, problemId, existing, userId);
    }

    const detail = await this.readModel.getProblemDetail(tripId, problemId);
    const action = detail.actions.find((a) => a.actionId === normalized.selectedActionId);
    if (!action) {
      throw new NotFoundException(`DECISION_ACTION_NOT_FOUND: ${normalized.selectedActionId}`);
    }
    if (!action.allowed) {
      throw new BadRequestException(action.blockedReason ?? 'DECISION_ACTION_NOT_ALLOWED');
    }

    assertAcknowledgementsProvided({
      requiresConfirmation: action.requiresConfirmation,
      enforcement: detail.problem.enforcement,
      detail: {
        type: detail.problem.type,
        semanticKey: detail.problem.semanticKey,
        assertions: await this.loadAssertionsForAck(detail.problem.problemId, tripId, detail),
      },
      acknowledgement: normalized.acknowledgement,
    });

    const writeChain = detail.actionability.writeChain;
    const resolutionId = this.resolutionStore.buildResolutionId(problemId);
    const decidedAt = new Date().toISOString();

    if (writeChain === 'EVALUATE_AUTHORIZE_EXECUTE') {
      return this.submitCanonicalResolution({
        tripId,
        problemId,
        userId,
        body: normalized,
        detail,
        actionId: normalized.selectedActionId,
        resolutionId,
        idempotencyKey,
        decidedAt,
      });
    }

    if (writeChain === 'APPLY_AND_POLL') {
      return this.submitLegacyResolution({
        tripId,
        problemId,
        userId,
        body: normalized,
        detail,
        resolutionId,
        idempotencyKey,
        decidedAt,
      });
    }

    throw new BadRequestException('DECISION_PROBLEM_DOES_NOT_REQUIRE_RESOLUTION');
  }

  async applyResolution(
    tripId: string,
    problemId: string,
    userId: string,
    opts?: ApplyResolutionOptions,
  ): Promise<ApplyDecisionProblemResponse> {
    const stored = await this.resolutionStore.getForProblem(tripId, problemId);
    if (!stored) {
      throw new NotFoundException(`DECISION_RESOLUTION_NOT_FOUND: ${problemId}`);
    }

    const causalTraceRef = await this.guardApplyCausalTrace({
      tripId,
      problemId,
      optionId: stored.selectedActionId,
      causalTraceRef: opts?.causalTraceRef,
    });

    if (stored.status === 'VERIFIED') {
      return this.buildApplyResponse(tripId, stored, causalTraceRef);
    }
    if (stored.status === 'APPLIED') {
      return this.finalizeApplyResponse(tripId, stored, userId, {
        ...opts,
        causalTraceRef,
      });
    }

    if (stored.writeChain === 'EVALUATE_AUTHORIZE_EXECUTE') {
      return this.applyCanonicalResolution(tripId, problemId, userId, stored, {
        ...opts,
        causalTraceRef,
      });
    }

    if (isPhase6NonCanonicalApplyBlocked()) {
      throw new BadRequestException({
        code: 'NON_CANONICAL_APPLY_DEPRECATED',
        message:
          'Legacy apply 已停用；请使用 EVALUATE_AUTHORIZE_EXECUTE writeChain（decision-problems submit → apply）',
      });
    }

    return this.applyLegacyResolution(tripId, problemId, userId, stored, {
      ...opts,
      causalTraceRef,
    });
  }

  private async guardApplyCausalTrace(input: {
    tripId: string;
    problemId: string;
    optionId: string;
    causalTraceRef?: CausalTraceReference;
  }): Promise<CausalTraceReference | undefined> {
    if (!this.causalTrace) return input.causalTraceRef;
    try {
      const currentWs = await this.readModel.resolveWorldStateVersionForTrip(input.tripId);
      const ref =
        input.causalTraceRef ??
        this.causalTrace.getActiveRef(input.tripId, input.problemId);
      if (!ref) return undefined;
      this.causalTrace.assertExecuteAllowed({
        ref,
        problemId: input.problemId,
        optionId: input.optionId,
        currentWorldStateVersion: currentWs,
      });
      this.causalTrace.bindExecuting(ref.traceId);
      return ref;
    } catch (e) {
      if (e instanceof CausalTraceStaleError) throw e;
      return input.causalTraceRef;
    }
  }

  async startApplyResolutionAsync(
    tripId: string,
    problemId: string,
    userId: string,
  ): Promise<StartDecisionProblemApplyResponse> {
    const existing = this.applyDeferredStore.findActiveForProblem(tripId, problemId);
    if (existing) {
      return this.buildStartApplyResponse(existing.taskId, tripId, problemId, true);
    }

    const taskId = `dp_apply_${randomBytes(6).toString('hex')}`;
    const entry: DecisionProblemApplyDeferredTask = {
      taskId,
      tripId,
      problemId,
      userId,
      createdAt: Date.now(),
      status: 'pending',
      promise: Promise.resolve({} as ApplyDecisionProblemResponse),
    };

    this.applyDeferredStore.put(taskId, entry);

    const promise = this.runDeferredApply(taskId, tripId, problemId, userId);
    entry.promise = promise;
    promise
      .then((result) => {
        entry.status = 'ready';
        entry.result = result;
      })
      .catch((e: unknown) => {
        entry.status = 'failed';
        entry.error = e instanceof Error ? e.message : 'APPLY_FAILED';
      });

    return this.buildStartApplyResponse(taskId, tripId, problemId, false);
  }

  getApplyTask(
    tripId: string,
    problemId: string,
    taskId: string,
  ): DecisionProblemApplyTaskResponse {
    const entry = this.applyDeferredStore.get(taskId);
    if (!entry || entry.tripId !== tripId || entry.problemId !== problemId) {
      throw new NotFoundException(`DECISION_APPLY_TASK_NOT_FOUND: ${taskId}`);
    }
    return this.buildApplyTaskResponse(entry);
  }

  private async runDeferredApply(
    taskId: string,
    tripId: string,
    problemId: string,
    userId: string,
  ): Promise<ApplyDecisionProblemResponse> {
    const entry = this.applyDeferredStore.get(taskId);
    if (!entry) {
      throw new NotFoundException(`DECISION_APPLY_TASK_NOT_FOUND: ${taskId}`);
    }

    try {
      entry.status = 'applying';
      const partial = await this.applyResolution(tripId, problemId, userId, {
        deferRevalidation: true,
      });
      if (partial.revalidation?.status === 'PASSED') {
        return partial;
      }

      entry.status = 'revalidating';
      const stored = await this.resolutionStore.getForProblem(tripId, problemId);
      if (!stored) {
        throw new NotFoundException(`DECISION_RESOLUTION_NOT_FOUND: ${problemId}`);
      }
      const final = await this.finalizeApplyResponse(tripId, stored, userId);
      return final;
    } catch (e) {
      entry.error = e instanceof Error ? e.message : 'APPLY_FAILED';
      throw e;
    }
  }

  private buildStartApplyResponse(
    taskId: string,
    tripId: string,
    problemId: string,
    reused: boolean,
  ): StartDecisionProblemApplyResponse {
    return {
      schemaId: 'tripnara.decision_problem_apply_accepted@v1',
      taskId,
      tripId,
      problemId,
      status: 'PENDING',
      pollUrl: this.buildApplyPollUrl(tripId, problemId, taskId),
      pollIntervalMs: DECISION_APPLY_DEFERRED_POLL_INTERVAL_MS,
      generatedAt: new Date().toISOString(),
      reused,
    };
  }

  private buildApplyTaskResponse(
    entry: DecisionProblemApplyDeferredTask,
  ): DecisionProblemApplyTaskResponse {
    const statusMap = {
      pending: 'PENDING',
      applying: 'APPLYING',
      revalidating: 'REVALIDATING',
      ready: 'READY',
      failed: 'FAILED',
    } as const;

    return {
      schemaId: 'tripnara.decision_problem_apply_task@v1',
      taskId: entry.taskId,
      tripId: entry.tripId,
      problemId: entry.problemId,
      status: statusMap[entry.status],
      pollUrl: this.buildApplyPollUrl(entry.tripId, entry.problemId, entry.taskId),
      pollIntervalMs: DECISION_APPLY_DEFERRED_POLL_INTERVAL_MS,
      generatedAt: new Date().toISOString(),
      result: entry.status === 'ready' ? entry.result : undefined,
      error: entry.status === 'failed' ? entry.error : undefined,
    };
  }

  private buildApplyPollUrl(tripId: string, problemId: string, taskId: string): string {
    return `/trips/${tripId}/decision-problems/${problemId}/apply-tasks/${taskId}`;
  }

  async getResolutionForProblem(
    tripId: string,
    problemId: string,
  ): Promise<StoredDecisionProblemResolution | undefined> {
    return this.resolutionStore.getForProblem(tripId, problemId);
  }

  private async submitCanonicalResolution(input: {
    tripId: string;
    problemId: string;
    userId: string;
    body: SubmitDecisionProblemResolutionRequest;
    detail: Awaited<ReturnType<UnifiedDecisionProblemReadModelService['getProblemDetail']>>;
    actionId: string;
    resolutionId: string;
    idempotencyKey: string;
    decidedAt: string;
  }): Promise<SubmitDecisionProblemResolutionResponse> {
    let decisionId = input.detail.resolution?.resolutionId;
    let actionPlanId = input.detail.resolution?.actionPlanId;

    if (!decisionId) {
      const canonicalView = await this.canonical.getProblem(input.tripId, input.problemId);
      decisionId = canonicalView.record?.decisionId;
      actionPlanId =
        canonicalView.planVersion?.planVersionId ?? actionPlanId;
    }

    if (!decisionId) {
      const evaluated = await this.runCanonicalEvaluate(input.tripId, input.problemId);
      decisionId =
        (evaluated as { record?: { decisionId?: string } }).record?.decisionId ??
        (evaluated as { decisionId?: string }).decisionId;
      actionPlanId =
        (evaluated as { planVersion?: { planVersionId?: string } }).planVersion?.planVersionId ??
        actionPlanId;
    }

    if (!decisionId) {
      throw new BadRequestException('CANONICAL_EVALUATE_DID_NOT_PRODUCE_DECISION');
    }

    await this.canonical.authorize({
      tripId: input.tripId,
      decisionId,
      choice: input.actionId,
    });

    const stored = await this.resolutionStore.upsert(input.tripId, {
      resolutionId: input.resolutionId,
      problemId: input.problemId,
      semanticKey: input.detail.problem.semanticKey,
      selectedActionId: input.actionId,
      writeChain: 'EVALUATE_AUTHORIZE_EXECUTE',
      status: 'AUTHORIZED',
      decidedAt: input.decidedAt,
      decidedByUserId: input.userId,
      decisionId,
      actionPlanId,
      idempotencyKey: input.idempotencyKey,
      acknowledgement: input.body.acknowledgement,
    });

    const collaborativeTask = await this.syncCollaborativeTaskRef(
      input.tripId,
      input.userId,
      input.problemId,
      stored.resolutionId,
      actionPlanId,
    );

    const causalTraceRef = this.bindSubmitCausalTrace(
      input.body,
      input.detail,
      stored.resolutionId,
    );

    return {
      schemaId: 'tripnara.decision_problem_resolution_submit@v1',
      tripId: input.tripId,
      problemId: input.problemId,
      generatedAt: new Date().toISOString(),
      resolution: toResolutionSummary(stored),
      problem: {
        workflowStatus: 'DECIDED',
        executionStatus: actionPlanId ? 'DRAFT_CREATED' : 'NOT_STARTED',
      },
      nextStep: 'APPLY',
      collaborativeTask,
      suggestedFollowUps: buildSuggestedSubTasks(input.detail.problem.semanticKey),
      causalTraceRef,
      requiredAcknowledgements: buildRequiredAcknowledgements({
        requiresConfirmation: input.detail.actions.find((a) => a.actionId === input.actionId)
          ?.requiresConfirmation,
        enforcement: input.detail.problem.enforcement,
        detail: {
          type: input.detail.problem.type,
          semanticKey: input.detail.problem.semanticKey,
          assertions: await this.loadAssertionsForAck(
            input.problemId,
            input.tripId,
            input.detail,
          ),
        },
      }),
    };
  }

  private async submitLegacyResolution(input: {
    tripId: string;
    problemId: string;
    userId: string;
    body: SubmitDecisionProblemResolutionRequest;
    detail: Awaited<ReturnType<UnifiedDecisionProblemReadModelService['getProblemDetail']>>;
    resolutionId: string;
    idempotencyKey: string;
    decidedAt: string;
  }): Promise<SubmitDecisionProblemResolutionResponse> {
    const stored = await this.resolutionStore.upsert(input.tripId, {
      resolutionId: input.resolutionId,
      problemId: input.problemId,
      semanticKey: input.detail.problem.semanticKey,
      selectedActionId: input.body.selectedActionId,
      writeChain: 'APPLY_AND_POLL',
      status: 'AUTHORIZED',
      decidedAt: input.decidedAt,
      decidedByUserId: input.userId,
      idempotencyKey: input.idempotencyKey,
      acknowledgement: input.body.acknowledgement,
    });

    const collaborativeTask = await this.syncCollaborativeTaskRef(
      input.tripId,
      input.userId,
      input.problemId,
      stored.resolutionId,
    );

    const causalTraceRef = this.bindSubmitCausalTrace(
      input.body,
      input.detail,
      stored.resolutionId,
    );

    return {
      schemaId: 'tripnara.decision_problem_resolution_submit@v1',
      tripId: input.tripId,
      problemId: input.problemId,
      generatedAt: new Date().toISOString(),
      resolution: toResolutionSummary(stored),
      problem: {
        workflowStatus: 'DECIDED',
        executionStatus: 'NOT_STARTED',
      },
      nextStep: 'APPLY',
      collaborativeTask,
      suggestedFollowUps: buildSuggestedSubTasks(input.detail.problem.semanticKey),
      causalTraceRef,
      requiredAcknowledgements: buildRequiredAcknowledgements({
        requiresConfirmation: input.detail.actions.find(
          (a) => a.actionId === input.body.selectedActionId,
        )?.requiresConfirmation,
        enforcement: input.detail.problem.enforcement,
        detail: {
          type: input.detail.problem.type,
          semanticKey: input.detail.problem.semanticKey,
          assertions: await this.loadAssertionsForAck(
            input.problemId,
            input.tripId,
            input.detail,
          ),
        },
      }),
    };
  }

  private bindSubmitCausalTrace(
    body: SubmitDecisionProblemResolutionRequest,
    detail: Awaited<ReturnType<UnifiedDecisionProblemReadModelService['getProblemDetail']>>,
    resolutionId: string,
  ): CausalTraceReference | undefined {
    const ref = body.causalTraceRef ?? detail.causalTraceRef;
    if (!ref || !this.causalTrace) return ref;
    this.causalTrace.bindSelected({
      traceId: ref.traceId,
      optionId: body.selectedActionId,
      executionRef: resolutionId,
    });
    return ref;
  }

  private async loadAssertionsForAck(
    problemId: string,
    tripId: string,
    detail: Awaited<ReturnType<UnifiedDecisionProblemReadModelService['getProblemDetail']>>,
  ): Promise<ConstraintAssertion[]> {
    try {
      const legacy = await this.semantics.getProblem(tripId, problemId);
      return legacy.assertions;
    } catch {
      return [
        {
          id: `${problemId}:ack`,
          sourceSystem: 'FEASIBILITY' as const,
          sourceRefId: problemId,
          nature: 'HARD_CONSTRAINT' as const,
          domain: 'TIME' as const,
          enforcement: detail.problem.enforcement,
          overridable: detail.problem.enforcement !== 'BLOCK',
          condition: detail.problem.semanticKey,
          conclusion: 'ack-fallback',
          proofs: [],
        },
      ];
    }
  }

  private async applyCanonicalResolution(
    tripId: string,
    problemId: string,
    userId: string,
    stored: StoredDecisionProblemResolution,
    opts?: ApplyResolutionOptions,
  ): Promise<ApplyDecisionProblemResponse> {
    if (!stored.decisionId) {
      throw new BadRequestException('CANONICAL_RESOLUTION_MISSING_DECISION_ID');
    }

    await this.resolutionStore.upsert(tripId, { ...stored, status: 'APPLYING' });

    try {
      const executed = await this.canonical.execute({
        tripId,
        decisionId: stored.decisionId,
        idempotencyKey:
          stored.idempotencyKey ?? buildPlanVersionIdempotencyKey(tripId, stored.decisionId),
      });

      const actionPlanId =
        (executed as { planVersion?: { planVersionId?: string } }).planVersion?.planVersionId ??
        stored.actionPlanId;

      const updated = await this.resolutionStore.upsert(tripId, {
        ...stored,
        status: 'APPLIED',
        actionPlanId,
      });

      this.planningConflicts?.invalidateCache(tripId);
      this.readModel.invalidateCache(tripId);
      this.semantics.invalidateOptionsCache(tripId);
      return this.finalizeApplyResponse(tripId, updated, userId, opts);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'APPLY_FAILED';
      await this.resolutionStore.upsert(tripId, {
        ...stored,
        status: 'AUTHORIZED',
        failureMessage: message,
      });
      throw e;
    }
  }

  private async applyLegacyResolution(
    tripId: string,
    problemId: string,
    userId: string,
    stored: StoredDecisionProblemResolution,
    opts?: ApplyResolutionOptions,
  ): Promise<ApplyDecisionProblemResponse> {
    await this.resolutionStore.upsert(tripId, { ...stored, status: 'APPLYING' });

    const applyKey = `${stored.idempotencyKey ?? stored.resolutionId}:apply`;
    try {
      const createDecision = () =>
        this.semantics.createDecision(tripId, userId, {
          problemId,
          selectedOptionId: stored.selectedActionId,
          idempotencyKey: applyKey,
          execute: true,
          acknowledgement: stored.acknowledgement,
        });
      const result = this.effectivePlanWriteGuard
        ? await this.effectivePlanWriteGuard.runWithAuthority('execute', createDecision)
        : await createDecision();

      const executionStatus = result.executionStatus;
      const applied = executionStatus === 'APPLIED' || executionStatus === 'RESOLVED';

      const updated = await this.resolutionStore.upsert(tripId, {
        ...stored,
        status: applied ? 'APPLIED' : result.decision.status === 'EXECUTED' ? 'APPLIED' : 'FAILED',
        decisionId: result.effectiveDecisionId ?? result.decision.id,
        failureMessage: applied
          ? undefined
          : result.applyResult?.message ??
            (result.decision.status === 'PROPOSED'
              ? 'DECISION_NOT_APPROVED: decision remained PROPOSED after apply'
              : `DECISION_STATUS_${result.decision.status}`),
      });

      this.planningConflicts?.invalidateCache(tripId);
      this.readModel.invalidateCache(tripId);
      this.semantics.invalidateOptionsCache(tripId);
      const response = await this.finalizeApplyResponse(tripId, updated, userId, opts);
      if (result.problemResolution) {
        response.legacyDecision = {
          decisionId: result.decision.id,
          executionStatus: result.executionStatus,
          problemResolution: result.problemResolution,
        };
      } else if (response.legacyDecision) {
        response.legacyDecision = {
          ...response.legacyDecision,
          decisionId: result.decision.id,
          executionStatus: result.executionStatus,
        };
      } else {
        response.legacyDecision = {
          decisionId: result.decision.id,
          executionStatus: result.executionStatus,
        };
      }
      if (result.applyResult) {
        response.applyResult = {
          status: result.applyResult.status,
          message: result.applyResult.message,
          persisted: result.applyResult.persisted,
        };
      }
      return response;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'APPLY_FAILED';
      await this.resolutionStore.upsert(tripId, {
        ...stored,
        status: 'AUTHORIZED',
        failureMessage: message,
      });
      throw e;
    }
  }

  private async finalizeApplyResponse(
    tripId: string,
    stored: StoredDecisionProblemResolution,
    userId?: string,
    opts?: ApplyResolutionOptions,
  ): Promise<ApplyDecisionProblemResponse> {
    let nextStored = stored;
    let revalidation: NonNullable<ApplyDecisionProblemResponse['revalidation']> = {
      status: 'PENDING',
      message: '等待校验',
    };
    let problem: ApplyDecisionProblemResponse['problem'] = detailFromStore(stored);

    if (opts?.deferRevalidation) {
      if (stored.status === 'APPLIED' || stored.status === 'VERIFIED') {
        revalidation = {
          status: 'PENDING',
          message: '正在后台校验问题是否关闭',
        };
        problem =
          stored.status === 'VERIFIED'
            ? { workflowStatus: 'RESOLVED', executionStatus: 'VERIFIED' }
            : { workflowStatus: 'DECIDED', executionStatus: 'APPLIED' };
      }
    } else {
      if (opts?.causalTraceRef && (stored.status === 'APPLIED' || stored.status === 'VERIFIED')) {
        this.attachExecutedTraceRef(opts.causalTraceRef, stored.resolutionId);
      }
      const reval = await this.runPostApplyRevalidation(tripId, stored);
      nextStored = reval.stored;
      revalidation = reval.revalidation;
      problem = reval.problem;
    }

    let suggestedSubTasks: ApplyDecisionProblemResponse['suggestedSubTasks'];
    let collaborativeTask: ApplyDecisionProblemResponse['collaborativeTask'];

    if (!opts?.deferRevalidation && this.collaborativeSubTasks && userId && nextStored.status !== 'FAILED') {
      try {
        let problemTitle: string | undefined;
        try {
          const detail = await this.readModel.getProblemDetail(tripId, nextStored.problemId);
          problemTitle = detail.problem.title;
        } catch {
          problemTitle = undefined;
        }
        suggestedSubTasks = await this.collaborativeSubTasks.ensureSuggestedOnApply({
          tripId,
          problemId: nextStored.problemId,
          resolutionId: nextStored.resolutionId,
          actionPlanId: nextStored.actionPlanId,
          semanticKey: nextStored.semanticKey,
          problemTitle,
          userId,
        });
      } catch {
        suggestedSubTasks = undefined;
      }
    }

    if (!opts?.deferRevalidation && userId) {
      collaborativeTask = await this.syncCollaborativeTaskRef(
        tripId,
        userId,
        nextStored.problemId,
        nextStored.resolutionId,
        nextStored.actionPlanId,
      );
    }

    return {
      schemaId: 'tripnara.decision_problem_apply@v1',
      tripId,
      problemId: stored.problemId,
      generatedAt: new Date().toISOString(),
      resolution: toResolutionSummary(nextStored),
      problem,
      applyResult:
        nextStored.status === 'FAILED'
          ? { status: 'failed', message: nextStored.failureMessage }
          : nextStored.actionPlanId
            ? {
                status: nextStored.status === 'VERIFIED' ? 'verified' : 'applied',
                message:
                  nextStored.status === 'VERIFIED' ? '问题已关闭' : 'Plan Version 已生效',
                actionPlanId: nextStored.actionPlanId,
              }
            : { status: nextStored.status === 'VERIFIED' ? 'verified' : 'applied' },
      revalidation,
      suggestedSubTasks,
      collaborativeTask,
      ...(opts?.causalTraceRef ? { causalTraceRef: opts.causalTraceRef } : {}),
    };
  }

  private attachExecutedTraceRef(
    ref: CausalTraceReference,
    executionRef: string,
  ): CausalTraceReference {
    this.causalTrace?.bindExecuted({ traceId: ref.traceId, executionRef });
    return ref;
  }

  private calibrateCausalTraceAfterVerify(
    tripId: string,
    stored: StoredDecisionProblemResolution,
    validation?: import('../../../trips/decision-semantics/types/decision-semantics.types').DecisionOutcomeValidation,
  ): void {
    if (!this.causalTrace) return;
    const ref = this.causalTrace.getActiveRef(tripId, stored.problemId);
    if (!ref) return;
    const trace = this.causalTrace.getTrace(ref.traceId);
    if (!trace) return;

    const p90Effect = trace.effects.find((e) => e.effectType === 'SEGMENT_TRAVEL_TIME_P90');
    const predictedMinutes =
      p90Effect &&
      Number.isFinite(Number(p90Effect.predictedValue)) &&
      Number.isFinite(Number(p90Effect.previousValue))
        ? Math.max(
            0,
            Math.round(Number(p90Effect.predictedValue) - Number(p90Effect.previousValue)),
          )
        : undefined;

    const drivingObserved = validation?.observedOutcomes?.find((o) => o.metric === 'DRIVING_DURATION');
    const actualMinutes = drivingObserved ? Number(drivingObserved.actualValue) : undefined;

    this.causalTrace.bindCalibrated({
      traceId: ref.traceId,
      outcomeRef: stored.resolutionId,
      predictedMinutes,
      actualMinutes: Number.isFinite(actualMinutes) ? actualMinutes : undefined,
      verdict: validation?.verdict,
    });
  }

  private async runPostApplyRevalidation(
    tripId: string,
    stored: StoredDecisionProblemResolution,
  ): Promise<{
    stored: StoredDecisionProblemResolution;
    revalidation: NonNullable<ApplyDecisionProblemResponse['revalidation']>;
    problem: ApplyDecisionProblemResponse['problem'];
  }> {
    if (stored.status !== 'APPLIED') {
      return {
        stored,
        revalidation: { status: 'PENDING', message: '等待应用完成' },
        problem: detailFromStore(stored),
      };
    }

    const rows = await this.readModel.collectRows(tripId);
    let validationVerdict: import('../../../trips/decision-semantics/types/decision-semantics.types').OutcomeValidationVerdict | undefined;
    let outcomeValidation: import('../../../trips/decision-semantics/types/decision-semantics.types').DecisionOutcomeValidation | undefined;

    if (stored.writeChain === 'APPLY_AND_POLL' && stored.decisionId) {
      try {
        outcomeValidation = await this.outcomeValidation.validateDecision(tripId, stored.decisionId);
        validationVerdict = outcomeValidation.verdict;
      } catch {
        // fall through to row-based check
      }
    }

    const verdict = evaluateRevalidationFromRows({
      rows,
      problemId: stored.problemId,
      semanticKey: stored.semanticKey,
      validationVerdict,
    });

    if (verdict.status === 'PASSED') {
      const verified = await this.resolutionStore.upsert(tripId, { ...stored, status: 'VERIFIED' });
      this.calibrateCausalTraceAfterVerify(tripId, verified, outcomeValidation);
      return {
        stored: verified,
        revalidation: { status: 'PASSED', message: verdict.message },
        problem: { workflowStatus: 'RESOLVED', executionStatus: 'VERIFIED' },
      };
    }

    if (verdict.status === 'FAILED') {
      return {
        stored,
        revalidation: { status: 'FAILED', message: verdict.message },
        problem: { workflowStatus: 'DECIDED', executionStatus: 'APPLIED' },
      };
    }

    return {
      stored,
      revalidation: { status: 'PENDING', message: verdict.message },
      problem: { workflowStatus: 'DECIDED', executionStatus: 'APPLIED' },
    };
  }

  private async buildSubmitReplayResponse(
    tripId: string,
    problemId: string,
    stored: StoredDecisionProblemResolution,
    userId: string,
  ): Promise<SubmitDecisionProblemResolutionResponse> {
    const collaborativeTask = await this.syncCollaborativeTaskRef(
      tripId,
      userId,
      problemId,
      stored.resolutionId,
      stored.actionPlanId,
    );
    return {
      schemaId: 'tripnara.decision_problem_resolution_submit@v1',
      tripId,
      problemId,
      generatedAt: new Date().toISOString(),
      resolution: toResolutionSummary(stored),
      problem: {
        workflowStatus: 'DECIDED',
        executionStatus: mapStoredExecutionForSubmit(stored),
      },
      nextStep: 'APPLY',
      collaborativeTask,
      suggestedFollowUps: buildSuggestedSubTasks(stored.semanticKey),
    };
  }

  private async syncCollaborativeTaskRef(
    tripId: string,
    userId: string,
    problemId: string,
    resolutionId: string,
    actionPlanId?: string,
  ): Promise<SubmitDecisionProblemResolutionResponse['collaborativeTask']> {
    const negotiationTaskId = negotiationTaskIdForProblem(problemId);
    if (this.negotiationOrchestrator) {
      try {
        const tasks = await this.negotiationOrchestrator.listDecisionProblemCollaborativeTasks(
          tripId,
          userId,
        );
        const task = tasks.find((t) => t.problemId === problemId);
        if (task) {
          return {
            negotiationTaskId: task.negotiationTaskId ?? negotiationTaskId,
            resolutionId,
            actionPlanId: actionPlanId ?? task.actionPlanId ?? null,
          };
        }
      } catch {
        // best-effort projection
      }
    }
    return {
      negotiationTaskId,
      resolutionId,
      actionPlanId: actionPlanId ?? null,
    };
  }

  private async runCanonicalEvaluate(tripId: string, problemId: string) {
    if (isDecisionTriggerGatewayEnabled() && this.triggerGateway) {
      const dispatch = await this.triggerGateway.dispatch({
        kind: 'CANONICAL_PROBLEM_EVALUATE',
        tripId,
        problemId,
        source: 'UNIFIED_DECISION_API',
      });
      if (dispatch.status !== 'COMPLETED') {
        throw new BadRequestException(
          dispatch.error?.message ?? 'Decision Trigger Gateway evaluate failed',
        );
      }
      return dispatch.result as object;
    }
    return this.canonical.evaluate(tripId, problemId);
  }

  private buildApplyResponse(
    tripId: string,
    stored: StoredDecisionProblemResolution,
    causalTraceRef?: CausalTraceReference,
  ): ApplyDecisionProblemResponse {
    return {
      schemaId: 'tripnara.decision_problem_apply@v1',
      tripId,
      problemId: stored.problemId,
      generatedAt: new Date().toISOString(),
      resolution: toResolutionSummary(stored),
      problem: detailFromStore(stored),
      applyResult: { status: 'idempotent_replay', message: 'Resolution already applied' },
      revalidation: { status: stored.status === 'VERIFIED' ? 'PASSED' : 'PENDING' },
      ...(causalTraceRef ? { causalTraceRef } : {}),
    };
  }
}

function toResolutionSummary(
  stored: StoredDecisionProblemResolution,
): import('../contracts/unified-decision-ui.types').DecisionResolutionSummary {
  return {
    resolutionId: stored.resolutionId,
    problemId: stored.problemId,
    selectedActionId: stored.selectedActionId,
    status: stored.status,
    decidedAt: stored.decidedAt,
    actionPlanId: stored.actionPlanId,
  };
}

function mapStoredExecutionForSubmit(
  stored: StoredDecisionProblemResolution,
): import('../contracts/unified-decision-ui.types').DecisionProblemExecutionStatus {
  if (stored.status === 'AUTHORIZED' && stored.actionPlanId) return 'DRAFT_CREATED';
  if (stored.status === 'APPLIED' || stored.status === 'VERIFIED') return 'APPLIED';
  return 'NOT_STARTED';
}

function detailFromStore(stored: StoredDecisionProblemResolution) {
  return {
    workflowStatus:
      stored.status === 'VERIFIED'
        ? ('RESOLVED' as const)
        : ['APPLIED', 'APPLYING', 'AUTHORIZED'].includes(stored.status)
          ? ('DECIDED' as const)
          : ('DECIDED' as const),
    executionStatus:
      stored.status === 'VERIFIED'
        ? ('VERIFIED' as const)
        : stored.status === 'APPLIED'
          ? ('APPLIED' as const)
          : stored.status === 'APPLYING'
            ? ('APPLYING' as const)
            : stored.status === 'AUTHORIZED'
              ? stored.actionPlanId
                ? ('DRAFT_CREATED' as const)
                : ('NOT_STARTED' as const)
              : ('NOT_STARTED' as const),
  };
}
