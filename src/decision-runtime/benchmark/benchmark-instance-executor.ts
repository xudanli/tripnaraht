/**
 * Task E1 — Stage-aware single-instance executor (resume-safe).
 */

import * as path from 'node:path';
import { buildTaskDScenarios } from '../../decision-lab/e2e/task-d-scenarios.fixture';
import {
  icelandMinimalWorldState,
} from '../../decision-lab/fixtures/iceland-minimal.fixture';
import {
  BenchmarkHoldAbortedError,
  interruptibleSleep,
} from './benchmark-shutdown.util';
import type { OptimizationShadowEvent } from '../observability/shadow-divergence.types';
import type {
  BenchmarkDatasetInstance,
  BenchmarkInstanceExecution,
  BenchmarkRunConfig,
} from './benchmark-run.types';
import type { BenchmarkReviewDisposition } from './benchmark-review-disposition.util';
import {
  isMaterializeExclusionSkipReason,
  resolveMaterializeSkipReason,
  type MaterializeResultArtifact,
} from './benchmark-review-disposition.util';
import { BenchmarkRunStore } from './benchmark-run.store';
import {
  hashJson,
  instanceArtifactDir,
  readArtifact,
  writeArtifact,
  artifactExists,
  hashArtifactFile,
} from './benchmark-artifact.util';
import {
  resolveResumeStageWithArtifacts,
  shouldReSubmitAuthority,
} from './benchmark-resume.util';
import {
  classifyHttpFailure,
  resolveInstanceStatusAfterFailure,
  backoffForAttempt,
} from './benchmark-failure.util';
import {
  detectArtifactHashMismatch,
  detectEvidenceGap,
} from './benchmark-evidence.util';

type WriteArtifactFn = typeof writeArtifact;
type ReadArtifactFn = typeof readArtifact;
type ArtifactExistsFn = typeof artifactExists;
type InstanceArtifactDirFn = typeof instanceArtifactDir;

export interface BenchmarkExecutorDeps {
  fetchFn?: typeof fetch;
  writeArtifactFn?: WriteArtifactFn;
  readArtifactFn?: ReadArtifactFn;
  artifactExistsFn?: ArtifactExistsFn;
  instanceArtifactDirFn?: InstanceArtifactDirFn;
  sleepFn?: (ms: number) => Promise<void>;
  nowFn?: () => number;
  shadowPollIntervalMs?: number;
}

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string };
};

export interface InstanceExecutionResult {
  status: BenchmarkInstanceExecution['status'];
  reviewDisposition?: BenchmarkReviewDisposition;
  abortRun?: boolean;
}

export class BenchmarkInstanceExecutor {
  private readonly fetchFn: typeof fetch;
  private readonly writeArtifactFn: WriteArtifactFn;
  private readonly readArtifactFn: ReadArtifactFn;
  private readonly artifactExistsFn: ArtifactExistsFn;
  private readonly instanceArtifactDirFn: InstanceArtifactDirFn;
  private readonly sleepFn: (ms: number) => Promise<void>;
  private readonly nowFn: () => number;
  private readonly shadowPollIntervalMs: number;

  constructor(
    private readonly store: BenchmarkRunStore,
    private readonly config: BenchmarkRunConfig,
    private readonly runnerId: string,
    deps: BenchmarkExecutorDeps = {},
  ) {
    this.fetchFn = deps.fetchFn ?? fetch;
    this.writeArtifactFn = deps.writeArtifactFn ?? writeArtifact;
    this.readArtifactFn = deps.readArtifactFn ?? readArtifact;
    this.artifactExistsFn = deps.artifactExistsFn ?? artifactExists;
    this.instanceArtifactDirFn = deps.instanceArtifactDirFn ?? instanceArtifactDir;
    this.sleepFn = deps.sleepFn ?? sleep;
    this.nowFn = deps.nowFn ?? Date.now;
    this.shadowPollIntervalMs = deps.shadowPollIntervalMs ?? 500;
  }

  async execute(
    execution: BenchmarkInstanceExecution,
    datasetInst: BenchmarkDatasetInstance,
  ): Promise<InstanceExecutionResult> {
    const artifactDir =
      execution.artifactDirectory ??
      this.instanceArtifactDirFn(execution.benchmarkRunId, execution.instanceId);

    const authorityPath = path.join(artifactDir, 'authority-response.json');
    const shadowPath = path.join(artifactDir, 'shadow-event.json');
    const materializePath = path.join(artifactDir, 'materialize-result.json');

    execution = await this.reconcileFromArtifacts(
      execution,
      artifactDir,
      authorityPath,
      shadowPath,
      materializePath,
    );

    const hasAuthorityFile = await this.artifactExistsFn(authorityPath);
    const hasShadowFile = await this.artifactExistsFn(shadowPath);
    const hasMaterializeFile = await this.artifactExistsFn(materializePath);
    const materializeArtifact = hasMaterializeFile
      ? await this.readArtifactFn<MaterializeResultArtifact>(materializePath)
      : undefined;
    const hasAuthority =
      hasAuthorityFile ||
      execution.status === 'AUTHORITY_COMPLETED' ||
      execution.status === 'SHADOW_COMPLETED' ||
      execution.status === 'REVIEW_MATERIALIZED' ||
      Boolean(execution.authorityResponseHash);
    const hasShadow =
      hasShadowFile ||
      execution.status === 'SHADOW_COMPLETED' ||
      execution.status === 'REVIEW_MATERIALIZED' ||
      Boolean(execution.comparisonId);
    const hasMaterialize =
      Boolean(materializeArtifact?.reviewCaseId) ||
      execution.status === 'REVIEW_MATERIALIZED' ||
      Boolean(execution.reviewCaseId);

    const integrityFailure = await this.verifyEvidenceIntegrity(
      execution,
      authorityPath,
      shadowPath,
      materializePath,
      hasAuthorityFile,
      hasShadowFile,
      hasMaterializeFile,
    );
    if (integrityFailure) {
      return integrityFailure;
    }

    const stage = resolveResumeStageWithArtifacts({
      status: execution.status,
      hasAuthorityResponse: hasAuthority,
      hasShadowEvent: hasShadow,
      hasReviewCase: hasMaterialize || Boolean(execution.reviewCaseId),
    });

    if (stage === 'SKIP_TERMINAL') {
      return { status: execution.status };
    }

    await this.store.heartbeat(execution.id, this.runnerId);

    try {
      if (shouldReSubmitAuthority(stage, hasAuthority)) {
        return await this.runAuthorityStage(execution, datasetInst, artifactDir);
      }
      if (stage === 'WAIT_SHADOW' || (stage === 'SUBMIT_AUTHORITY' && hasAuthority)) {
        return await this.runShadowWaitStage(execution, artifactDir, authorityPath, shadowPath);
      }
      if (stage === 'MATERIALIZE') {
        return await this.runMaterializeStage(
          execution,
          artifactDir,
          shadowPath,
          materializePath,
        );
      }
      if (stage === 'FINALIZE') {
        return await this.runFinalizeStage(execution, artifactDir, materializePath);
      }
      return { status: execution.status };
    } catch (err: unknown) {
      if (err instanceof BenchmarkHoldAbortedError) throw err;
      return this.handleFailure(execution, err, 'UNKNOWN');
    }
  }

  private async runAuthorityStage(
    execution: BenchmarkInstanceExecution,
    datasetInst: BenchmarkDatasetInstance,
    artifactDir: string,
  ): Promise<InstanceExecutionResult> {
    const shadowPath = path.join(artifactDir, 'shadow-event.json');
    const materializePath = path.join(artifactDir, 'materialize-result.json');

    const { body, headers } = buildHttpRequest(
      datasetInst,
      execution.requestId,
      execution.benchmarkRunId,
    );

    await this.writeArtifactFn(artifactDir, 'input.json', body);
    await this.writeArtifactFn(artifactDir, 'authority-request.json', { body, headers });

    const res = await this.api<{
      optimizationShadow?: OptimizationShadowEvent;
      record?: { selectedCandidateId?: string; decisionId?: string };
    }>('POST', '/decision-engine/v1/canonical-plan-selection', body, headers);

    if (!res.json.success) {
      return this.handleHttpFailure(
        execution,
        res.status,
        res.json.error?.message ?? 'authority failed',
        'AUTHORITY',
      );
    }

    const { hash: authorityResponseHash } = await this.writeArtifactFn(
      artifactDir,
      'authority-response.json',
      res.json,
    );

    const holdMs = Number(process.env.BENCHMARK_SMOKE_HOLD_AFTER_AUTHORITY_ARTIFACT_MS ?? 0);
    const holdFor = process.env.BENCHMARK_SMOKE_HOLD_FOR_INSTANCE_ID?.trim();
    if (
      holdMs > 0 &&
      (!holdFor || holdFor === execution.instanceId)
    ) {
      await interruptibleSleep(holdMs, this.sleepFn);
    }

    const inlineShadow = res.json.data?.optimizationShadow;
    const decisionRunId = execution.requestId;
    const authorityWinnerId =
      res.json.data?.record?.selectedCandidateId ??
      inlineShadow?.authorityResult?.selectedCandidateId;

    let next = await this.store.advanceInstance(execution.id, {
      status: 'AUTHORITY_COMPLETED',
      decisionRunId,
      requestHash: hashJson(body),
      authorityResponseHash,
      authorityWinnerId,
      artifactDirectory: artifactDir,
      authorityCompletedAt: new Date(),
    });

    if (inlineShadow?.comparisonId) {
      await this.writeArtifactFn(artifactDir, 'shadow-event.json', inlineShadow);
      next = await this.store.advanceInstance(execution.id, {
        status: 'SHADOW_COMPLETED',
        comparisonId: inlineShadow.comparisonId,
        shadowEventHash: hashJson(inlineShadow),
        shadowWinnerId: inlineShadow.shadowResult?.selectedCandidateId,
        eligibleForStrategyComparison: inlineShadow.eligibleForStrategyComparison,
        divergenceTypes: inlineShadow.divergence.types,
        shadowCompletedAt: new Date(),
      });
      if (!this.config.noMaterialize && inlineShadow.eligibleForStrategyComparison) {
        return this.runMaterializeStage(next, artifactDir, shadowPath, materializePath);
      }
    }

    return this.runShadowWaitStage(
      next,
      artifactDir,
      path.join(artifactDir, 'authority-response.json'),
      shadowPath,
    );
  }

  /** Artifact-first recovery when DB lags behind on-disk evidence. */
  private async verifyEvidenceIntegrity(
    execution: BenchmarkInstanceExecution,
    authorityPath: string,
    shadowPath: string,
    materializePath: string,
    hasAuthorityFile: boolean,
    hasShadowFile: boolean,
    hasMaterializeFile: boolean,
  ): Promise<InstanceExecutionResult | undefined> {
    const gap = detectEvidenceGap({
      status: execution.status,
      authorityResponseHash: execution.authorityResponseHash,
      hasAuthorityFile,
      comparisonId: execution.comparisonId,
      shadowEventHash: execution.shadowEventHash,
      hasShadowFile,
      reviewCaseId: execution.reviewCaseId,
      hasMaterializeFile,
    });
    if (gap) {
      await this.store.advanceInstance(execution.id, {
        status: 'TERMINAL_FAILED',
        failureClass: 'PERSISTENCE_ERROR',
        lastErrorCode: gap.code,
        lastErrorMessage: gap.message,
        lastErrorStage: 'EVIDENCE_INTEGRITY',
        completedAt: new Date(),
      });
      return { status: 'TERMINAL_FAILED' };
    }

    if (hasAuthorityFile && execution.authorityResponseHash) {
      const fileHash = await hashArtifactFile(authorityPath);
      const mismatch = detectArtifactHashMismatch({
        storedHash: execution.authorityResponseHash,
        fileHash,
        label: 'authority-response',
      });
      if (mismatch) {
        await this.store.advanceInstance(execution.id, {
          status: 'TERMINAL_FAILED',
          failureClass: 'PERSISTENCE_ERROR',
          lastErrorCode: mismatch.code,
          lastErrorMessage: mismatch.message,
          lastErrorStage: 'EVIDENCE_INTEGRITY',
          completedAt: new Date(),
        });
        return { status: 'TERMINAL_FAILED' };
      }
    }

    if (hasShadowFile && execution.shadowEventHash) {
      const fileHash = await hashArtifactFile(shadowPath);
      const mismatch = detectArtifactHashMismatch({
        storedHash: execution.shadowEventHash,
        fileHash,
        label: 'shadow-event',
      });
      if (mismatch) {
        await this.store.advanceInstance(execution.id, {
          status: 'TERMINAL_FAILED',
          failureClass: 'PERSISTENCE_ERROR',
          lastErrorCode: mismatch.code,
          lastErrorMessage: mismatch.message,
          lastErrorStage: 'EVIDENCE_INTEGRITY',
          completedAt: new Date(),
        });
        return { status: 'TERMINAL_FAILED' };
      }
    }

    return undefined;
  }

  /** Artifact-first recovery when DB lags behind on-disk evidence. */
  private async reconcileFromArtifacts(
    execution: BenchmarkInstanceExecution,
    artifactDir: string,
    authorityPath: string,
    shadowPath: string,
    materializePath: string,
  ): Promise<BenchmarkInstanceExecution> {
    let current = execution;

    const authority = await this.readArtifactFn<ApiResponse<{
      optimizationShadow?: OptimizationShadowEvent;
      record?: { selectedCandidateId?: string };
    }>>(authorityPath);
    if (
      authority?.success &&
      !['AUTHORITY_COMPLETED', 'SHADOW_COMPLETED', 'REVIEW_MATERIALIZED', 'COMPLETED'].includes(
        current.status,
      )
    ) {
      const inlineShadow = authority.data?.optimizationShadow;
      current = await this.store.advanceInstance(current.id, {
        status: 'AUTHORITY_COMPLETED',
        decisionRunId: current.requestId,
        authorityResponseHash: hashJson(authority),
        authorityWinnerId:
          authority.data?.record?.selectedCandidateId ??
          inlineShadow?.authorityResult?.selectedCandidateId,
        artifactDirectory: artifactDir,
        authorityCompletedAt: new Date(),
      });
    }

    const shadow = await this.readArtifactFn<OptimizationShadowEvent>(shadowPath);
    if (
      shadow?.comparisonId &&
      !['SHADOW_COMPLETED', 'REVIEW_MATERIALIZED', 'COMPLETED', 'EXCLUDED'].includes(current.status)
    ) {
      current = await this.store.advanceInstance(current.id, {
        status: 'SHADOW_COMPLETED',
        comparisonId: shadow.comparisonId,
        shadowEventHash: hashJson(shadow),
        shadowWinnerId: shadow.shadowResult?.selectedCandidateId,
        eligibleForStrategyComparison: shadow.eligibleForStrategyComparison,
        divergenceTypes: shadow.divergence.types,
        shadowCompletedAt: new Date(),
      });
    }

    const materialized = await this.readArtifactFn<{ reviewCaseId?: string }>(materializePath);
    if (
      materialized?.reviewCaseId &&
      !['REVIEW_MATERIALIZED', 'COMPLETED'].includes(current.status)
    ) {
      current = await this.store.advanceInstance(current.id, {
        status: 'REVIEW_MATERIALIZED',
        reviewCaseId: materialized.reviewCaseId,
      });
    }

    return current;
  }

  private async runShadowWaitStage(
    execution: BenchmarkInstanceExecution,
    artifactDir: string,
    authorityPath: string,
    shadowPath: string,
  ): Promise<InstanceExecutionResult> {
    const decisionRunId = execution.decisionRunId ?? execution.requestId;
    const started = this.nowFn();
    const timeout = this.config.shadowWaitTimeoutMs;

    while (this.nowFn() - started < timeout) {
      await this.store.heartbeat(execution.id, this.runnerId);

      if (execution.comparisonId) {
        const byId = await this.api<OptimizationShadowEvent>(
          'GET',
          `/decision-engine/v1/shadow-observability/events/${encodeURIComponent(execution.comparisonId)}`,
        );
        if (byId.json.success && byId.json.data) {
          return this.persistShadowAndContinue(
            execution,
            artifactDir,
            shadowPath,
            byId.json.data,
          );
        }
      }

      const list = await this.api<{ events: OptimizationShadowEvent[] }>(
        'GET',
        `/decision-engine/v1/shadow-observability/events?decisionRunId=${encodeURIComponent(decisionRunId)}&limit=5`,
      );
      const event = list.json.data?.events?.[0];
      if (event) {
        return this.persistShadowAndContinue(execution, artifactDir, shadowPath, event);
      }

      await this.sleepFn(this.shadowPollIntervalMs);
    }

    return this.handleFailure(
      execution,
      new Error('Shadow event wait timeout'),
      'WAIT_SHADOW',
    );
  }

  private async persistShadowAndContinue(
    execution: BenchmarkInstanceExecution,
    artifactDir: string,
    shadowPath: string,
    event: OptimizationShadowEvent,
  ): Promise<InstanceExecutionResult> {
    const { hash: shadowEventHash } = await this.writeArtifactFn(
      artifactDir,
      'shadow-event.json',
      event,
    );

    const updated = await this.store.advanceInstance(execution.id, {
      status: 'SHADOW_COMPLETED',
      comparisonId: event.comparisonId,
      shadowEventHash,
      shadowWinnerId: event.shadowResult?.selectedCandidateId,
      eligibleForStrategyComparison: event.eligibleForStrategyComparison,
      divergenceTypes: event.divergence.types,
      shadowCompletedAt: new Date(),
    });

    if (!event.eligibleForStrategyComparison) {
      const reason = event.divergence.types.includes('INPUT_MISMATCH')
        ? 'INPUT_MISMATCH'
        : 'NOT_ELIGIBLE';
      if (reason === 'INPUT_MISMATCH') {
        await this.store.advanceInstance(execution.id, {
          status: 'EXCLUDED',
          exclusionReason: reason,
          completedAt: new Date(),
        });
        return { status: 'EXCLUDED' };
      }
      await this.store.advanceInstance(execution.id, {
        status: 'COMPLETED',
        exclusionReason: reason,
        completedAt: new Date(),
      });
      return { status: 'COMPLETED', reviewDisposition: 'EXCLUDED' };
    }

    if (this.config.noMaterialize) {
      return this.runFinalizeStage(updated, artifactDir, '');
    }

    return this.runMaterializeStage(
      updated,
      artifactDir,
      shadowPath,
      path.join(artifactDir, 'materialize-result.json'),
    );
  }

  private async runMaterializeStage(
    execution: BenchmarkInstanceExecution,
    artifactDir: string,
    shadowPath: string,
    materializePath: string,
  ): Promise<InstanceExecutionResult> {
    const comparisonId = execution.comparisonId;
    const existing = await this.readArtifactFn<MaterializeResultArtifact>(materializePath);

    if (existing?.reviewCaseId) {
      const updated = await this.store.advanceInstance(execution.id, {
        status: 'REVIEW_MATERIALIZED',
        reviewCaseId: existing.reviewCaseId,
      });
      return this.runFinalizeStage(updated, artifactDir, materializePath);
    }

    const priorSkip = resolveMaterializeSkipReason(existing, comparisonId);
    if (priorSkip && isMaterializeExclusionSkipReason(priorSkip)) {
      return this.completeMaterializeExcluded(execution, artifactDir, priorSkip);
    }

    if (!comparisonId) {
      return this.handleFailure(execution, new Error('comparisonId missing'), 'MATERIALIZE');
    }

    const mat = await this.api<{
      created: number;
      alreadyExists: number;
      materialized: Array<{ reviewCaseId: string; comparisonId: string }>;
      skipped: Array<{ comparisonId: string; reason: string }>;
    }>('POST', '/decision-engine/v1/shadow-reviews/materialize', {
      comparisonIds: [comparisonId],
    });

    if (!mat.json.success) {
      return this.handleHttpFailure(
        execution,
        mat.status,
        mat.json.error?.message ?? 'materialize failed',
        'MATERIALIZE',
      );
    }

    await this.writeArtifactFn(artifactDir, 'materialize-result.json', mat.json.data);

    const reviewCase = mat.json.data?.materialized?.find((m) => m.comparisonId === comparisonId);

    const skipped = mat.json.data?.skipped?.find((s) => s.comparisonId === comparisonId);
    if (skipped && !reviewCase && isMaterializeExclusionSkipReason(skipped.reason)) {
      return this.completeMaterializeExcluded(execution, artifactDir, skipped.reason);
    }

    const reviewCaseId = reviewCase?.reviewCaseId;
    if (!reviewCaseId && (mat.json.data?.alreadyExists ?? 0) > 0) {
      const detail = await this.api<{ reviewCaseId?: string }>(
        'GET',
        `/decision-engine/v1/shadow-reviews/queue?limit=50`,
      );
      const found = (
        detail.json.data as { items?: Array<{ reviewCaseId: string; comparisonId: string }> }
      )?.items?.find((i) => i.comparisonId === comparisonId);
      if (found) {
        await this.writeArtifactFn(artifactDir, 'materialize-result.json', {
          reviewCaseId: found.reviewCaseId,
          comparisonId,
          alreadyExists: true,
        });
        const updated = await this.store.advanceInstance(execution.id, {
          status: 'REVIEW_MATERIALIZED',
          reviewCaseId: found.reviewCaseId,
        });
        return this.runFinalizeStage(updated, artifactDir, materializePath);
      }
    }

    if (!reviewCaseId) {
      return this.handleFailure(
        execution,
        new Error(`materialize produced no case: ${JSON.stringify(mat.json.data)}`),
        'MATERIALIZE',
      );
    }

    const updated = await this.store.advanceInstance(execution.id, {
      status: 'REVIEW_MATERIALIZED',
      reviewCaseId,
    });
    return this.runFinalizeStage(updated, artifactDir, materializePath);
  }

  private async completeMaterializeExcluded(
    execution: BenchmarkInstanceExecution,
    artifactDir: string,
    exclusionReason: string,
  ): Promise<InstanceExecutionResult> {
    const summary = {
      instanceId: execution.instanceId,
      comparisonId: execution.comparisonId,
      exclusionReason,
      completedAt: new Date().toISOString(),
    };
    await this.writeArtifactFn(artifactDir, 'execution-summary.json', summary);
    await this.store.advanceInstance(execution.id, {
      status: 'COMPLETED',
      exclusionReason,
      completedAt: new Date(),
    });
    return { status: 'COMPLETED', reviewDisposition: 'EXCLUDED' };
  }

  private async runFinalizeStage(
    execution: BenchmarkInstanceExecution,
    artifactDir: string,
    materializePath: string,
  ): Promise<InstanceExecutionResult> {
    const summary = {
      instanceId: execution.instanceId,
      comparisonId: execution.comparisonId,
      reviewCaseId: execution.reviewCaseId,
      authorityWinnerId: execution.authorityWinnerId,
      shadowWinnerId: execution.shadowWinnerId,
      completedAt: new Date().toISOString(),
    };
    await this.writeArtifactFn(artifactDir, 'execution-summary.json', summary);

    await this.store.advanceInstance(execution.id, {
      status: 'COMPLETED',
      completedAt: new Date(),
    });
    return { status: 'COMPLETED' };
  }

  private async handleHttpFailure(
    execution: BenchmarkInstanceExecution,
    httpStatus: number,
    message: string,
    stage: string,
  ): Promise<InstanceExecutionResult> {
    const classified = classifyHttpFailure({ httpStatus, message, stage });
    return this.applyFailure(execution, classified, message, stage);
  }

  private async handleFailure(
    execution: BenchmarkInstanceExecution,
    err: unknown,
    stage: string,
  ): Promise<InstanceExecutionResult> {
    const message = err instanceof Error ? err.message : String(err);
    const classified = classifyHttpFailure({ message, stage });
    return this.applyFailure(execution, classified, message, stage);
  }

  private async applyFailure(
    execution: BenchmarkInstanceExecution,
    classified: ReturnType<typeof classifyHttpFailure>,
    message: string,
    stage: string,
  ): Promise<InstanceExecutionResult> {
    const newStatus = resolveInstanceStatusAfterFailure(
      classified,
      execution.attemptCount,
      execution.maxAttempts,
    );
    await this.store.advanceInstance(execution.id, {
      status: newStatus,
      failureClass: classified.failureClass,
      lastErrorCode: classified.failureClass,
      lastErrorMessage: message,
      lastErrorStage: stage,
      completedAt: newStatus === 'TERMINAL_FAILED' || newStatus === 'EXCLUDED' ? new Date() : undefined,
    });
    if (classified.abortRun) {
      return { status: newStatus, abortRun: true };
    }
    await this.sleepFn(backoffForAttempt(execution.attemptCount, classified.backoffMs));
    return { status: newStatus };
  }

  private async api<T>(
    method: string,
    urlPath: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<{ status: number; json: ApiResponse<T> }> {
    const res = await this.fetchFn(`${this.config.baseUrl}${urlPath}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json: ApiResponse<T>;
    try {
      json = (await res.json()) as ApiResponse<T>;
    } catch {
      json = { success: false, error: { message: `Non-JSON (${res.status})` } };
    }
    return { status: res.status, json };
  }
}

function buildHttpRequest(
  inst: BenchmarkDatasetInstance,
  requestId: string,
  benchmarkRunId: string,
): { body: Record<string, unknown>; headers: Record<string, string> } {
  const scenarios = buildTaskDScenarios();
  const scenario = scenarios.find((s) => s.id === inst.scenarioRef);
  const worldState = icelandMinimalWorldState();

  const body: Record<string, unknown> = {
    tripId: inst.tripId,
    state: worldState,
    problemId: requestId,
    experimentContext: {
      experimentId: 'TASK_E1_BENCHMARK',
      scenarioId: inst.instanceId,
      runId: requestId,
      source: 'BENCHMARK_BATCH_RUNNER',
      benchmarkRunId,
    },
  };

  if (inst.realMulti || inst.scenarioRef === 'REAL-MULTI-CANDIDATE') {
    const realMultiScenario = scenarios.find((s) => s.id === 'TD-006-three-way');
    if (realMultiScenario) {
      body.prebuiltCandidates = realMultiScenario.candidates;
      body.constraintReportsByCandidateId = realMultiScenario.constraintReports;
    }
  } else if (scenario) {
    body.prebuiltCandidates = scenario.candidates;
    body.constraintReportsByCandidateId = scenario.constraintReports;
    const stagingShadowOptions: Record<string, unknown> = {};
    if (scenario.inputMismatch) stagingShadowOptions.inputMismatch = true;
    if (scenario.shadowError) stagingShadowOptions.shadowError = scenario.shadowError;
    if (scenario.shadowTimeLimitMs != null) {
      stagingShadowOptions.shadowTimeLimitMs = scenario.shadowTimeLimitMs;
    }
    if (Object.keys(stagingShadowOptions).length > 0) {
      body.stagingShadowOptions = stagingShadowOptions;
    }
  }

  const headers = {
    'X-Decision-Experiment-Id': 'TASK_E1_BENCHMARK',
    'X-Decision-Scenario-Id': inst.instanceId,
    'X-Decision-Run-Id': requestId,
    'X-Decision-Source': 'BENCHMARK_BATCH_RUNNER',
  };

  return { body, headers };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
