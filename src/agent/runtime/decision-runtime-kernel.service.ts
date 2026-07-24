import { Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import type { AgentService } from '../services/agent.service';
import type { ExecutionGatewayService } from '../services/execution-gateway.service';
import { AgentMemoryContextStore } from '../memory/context/agent-memory-context.store';
import { AgentExecutionContextStore } from './agent-execution-context.store';
import { DecisionOsContextAssemblerService } from './decision-os-context-assembler.service';
import { DecisionOsExecutionContextStore } from './decision-os-execution-context.store';
import { ExecutionTimelineRecorderService } from './execution-timeline-recorder.service';
import { GovernanceHydrationService } from '../../governance/activation/governance-hydration.service';
import { LlmIntentCompilerService } from './llm-intent-compiler.service';
import {
  prepareDecisionRuntimeTick,
  type DecisionRuntimeKernelAgentDeps,
} from './decision-runtime-kernel.prepare.util';
import { hydrateGovernanceAndDosContext } from './decision-runtime-kernel.governance-dos.util';
import { buildDosTickAuditV1, emitDosTickAudit } from './decision-os-tick-audit.util';
import type { RouteAndRunTaskProgressReporter } from './route-and-run-task-progress.reporter';
import type { DecisionTriggerGatewayService } from '../../decision-runtime/trigger/decision-trigger.gateway.service';
import type {
  DecisionRuntimeTickBody,
  DecisionRuntimeTickBundle,
  DecisionRuntimeTickPhase,
} from './decision-runtime-kernel.types';

function recordPhase(
  bundle: DecisionRuntimeTickBundle,
  phase: DecisionRuntimeTickPhase,
  startedAt: number,
): void {
  bundle.tickObs.phases.push({
    phase,
    at: new Date().toISOString(),
    duration_ms: Date.now() - startedAt,
  });
}

/**
 * Decision OS Runtime Kernel（Step 3 骨架）。
 *
 * `handleTick` = 单向数据流事件循环；厚重编排逻辑通过 `executeBody` 委托注入，避免大爆炸式搬迁。
 */
@Injectable()
export class DecisionRuntimeKernelService {
  private readonly logger = new Logger(DecisionRuntimeKernelService.name);

  constructor(
    private readonly agentMemoryContextStore: AgentMemoryContextStore,
    private readonly agentExecutionContextStore: AgentExecutionContextStore,
    @Optional() private readonly decisionOsContextAssembler?: DecisionOsContextAssemblerService,
    @Optional() private readonly decisionOsExecutionContextStore?: DecisionOsExecutionContextStore,
    @Optional() private readonly executionTimelineRecorder?: ExecutionTimelineRecorderService,
    @Optional() private readonly governanceHydration?: GovernanceHydrationService,
    @Optional() private readonly llmIntentCompiler?: LlmIntentCompilerService,
    @Optional() private readonly routeAndRunTaskProgressReporter?: RouteAndRunTaskProgressReporter,
    @Optional() private readonly decisionTriggerGateway?: DecisionTriggerGatewayService,
  ) {}

  /**
   * 核心运行时 Tick：`POST /agent/route_and_run` 主编排链入口。
   */
  async handleTick(
    agent: AgentService,
    gateway: ExecutionGatewayService,
    request: RouteAndRunRequestDto,
    executeBody: DecisionRuntimeTickBody,
  ): Promise<RouteAndRunResponseDto> {
    const $ = agent as any;
    const wallStart = Date.now();
    const gateStart = Date.now();

    const deps = this.buildAgentDeps($);
    const prepared = await prepareDecisionRuntimeTick(deps, request, wallStart);
    if (prepared.earlyResponse) {
      prepared.bundle.tickObs.phases.push({
        phase: 'GATEKEEPING',
        at: new Date().toISOString(),
        duration_ms: Date.now() - gateStart,
      });
      (request as RouteAndRunRequestDto & { __decisionRuntimeTickObs?: unknown }).__decisionRuntimeTickObs =
        prepared.bundle.tickObs;
      return prepared.earlyResponse;
    }

    const bundle = prepared.bundle;
    recordPhase(bundle, 'GATEKEEPING', gateStart);

    return await this.agentMemoryContextStore.runPromise(bundle.memory, async () => {
      return await this.agentExecutionContextStore.runPromise(bundle.execCtx, async () => {
        (request as RouteAndRunRequestDto & { __memoryExecutionBinding?: unknown }).__memoryExecutionBinding =
          bundle.execCtx.executionBinding;
        (request as RouteAndRunRequestDto & { __decisionRuntimeTickObs?: unknown }).__decisionRuntimeTickObs =
          bundle.tickObs;

        const startTime = Date.now();
        this.executionTimelineRecorder?.recordPoint({
          phase: 'route_and_run',
          eventType: 'chain.enter',
          nodeId: 'rr:gold:enter',
          parentNodeId: null,
          spanId: bundle.goldenChainSpanId,
          inputPayload: { trip_id: request.trip_id ?? null, has_message: !!request.message },
        });

        const chainSpan = this.executionTimelineRecorder?.startSpan({
          phase: 'route_and_run',
          operation: 'route_and_run.chain',
          parentSpanId: bundle.goldenChainSpanId,
          inputPayload: {
            request_id: request.request_id,
            trip_id: request.trip_id ?? null,
            tick_id: bundle.tickId,
          },
        });

        const execInner = {
          ...bundle.execCtx,
          activeParentSpanId: chainSpan?.spanId ?? bundle.execCtx.activeParentSpanId,
        };

        return await this.agentExecutionContextStore.runPromise(execInner, async () => {
          try {
            const execStart = Date.now();
            const outcome = await executeBody(bundle);
            recordPhase(bundle, 'EXECUTE_ORCHESTRATION', execStart);
            const audit = buildDosTickAuditV1(request, bundle, outcome, wallStart);
            emitDosTickAudit(audit, { logger: this.logger, prom: $.promMetrics });
            recordPhase(bundle, 'COMMIT', execStart);
            chainSpan?.finishSuccess({
              outputPayload: { status: 'success', tick_id: bundle.tickId },
              metadataSummary: { phase_count: bundle.tickObs.phases.length },
            });
            return outcome;
          } catch (error: unknown) {
            const recoveryStart = Date.now();
            recordPhase(bundle, 'RECOVERY', recoveryStart);
            chainSpan?.finishError({
              errorType: error instanceof Error ? error.name : 'Error',
              metadataSummary: { tick_id: bundle.tickId, failedPhase: 'EXECUTE_ORCHESTRATION' },
            });
            throw error;
          }
        });
      });
    });
  }

  /**
   * Tick 冻结后阶段：Governance + DOS 宪法装配（由编排体在 runBody 入口调用）。
   */
  async hydrateGovernanceAndDos(
    agent: AgentService,
    gateway: ExecutionGatewayService,
    request: RouteAndRunRequestDto,
    bundle: DecisionRuntimeTickBundle,
    replayStrictSeal: boolean,
  ): Promise<void> {
    const govDos = await hydrateGovernanceAndDosContext({
      request,
      memory: bundle.memory,
      bundle,
      replayAnchor: bundle.replayAnchor,
      replayStrictSeal,
      governanceHydration: this.governanceHydration,
      decisionOsContextAssembler: this.decisionOsContextAssembler,
      llmIntentCompiler: this.llmIntentCompiler,
      progressReporter: this.routeAndRunTaskProgressReporter,
      logger: this.logger,
    });
    bundle.governanceRuntime = govDos.governanceRuntime;
    bundle.dosExecutionContext = govDos.dosExecutionContext;
  }

  /** ALS 包裹：编排子链在 DOS 宪法上下文内执行 */
  async withDosContext<T>(
    bundle: DecisionRuntimeTickBundle,
    fn: () => Promise<T>,
  ): Promise<T> {
    const dosCtx = bundle.dosExecutionContext;
    if (dosCtx && this.decisionOsExecutionContextStore) {
      return this.decisionOsExecutionContextStore.runPromise(dosCtx, fn);
    }
    return fn();
  }

  private buildAgentDeps($: any): DecisionRuntimeKernelAgentDeps {
    return {
      memoryContextAssembler: $.memoryContextAssembler,
      hydrateRequestFitnessIfNeeded: (req, mem) => $.hydrateRequestFitnessIfNeeded(req, mem),
      memorySnapshotPersistence: $.memorySnapshotPersistence,
      ledgerRecomputeExecutor: $.ledgerRecomputeExecutor,
      incrementalRecomputeOrchestrator: $.incrementalRecomputeOrchestrator,
      agentExecutionContextFactory: $.agentExecutionContextFactory,
      getEntryResponses: () => $.getEntryResponses(),
      logger: $.logger,
      decisionTriggerGateway: this.decisionTriggerGateway,
    };
  }
}
