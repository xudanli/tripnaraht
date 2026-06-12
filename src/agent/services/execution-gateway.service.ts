import { forwardRef, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import { evaluateDedupConfidenceGate } from '../utils/confidence-dedup-gate.util';
import { buildExecutionControlContext } from '../utils/execution-control-context.builder';
import { decideExecution, interpretExecutionPolicyIR } from '../utils/ecps.decide-execution';
import {
  ExecutionTraceEmitter,
  attachExecutionTraceToResponse,
  newExecutionTraceId,
} from '../utils/execution-trace.emitter';
import { RequestDeduplicationService } from './request-deduplication.service';
import { EcpsRuntimeBiasService } from './ecps-runtime-bias.service';
import { analyzeExecutionTrace } from '../utils/trace-analyzer.util';
import { derivePolicyCorrectionSignals } from '../utils/policy-correction-kernel.util';
import { ExecutionPolicyVersionRegistryService } from './execution-policy-version-registry.service';
import { PolicyAgentPopulationService } from './policy-agent-population.service';
import { CognitiveMarketService } from './cognitive-market.service';
import { analyzeCognitiveThermodynamics } from '../utils/cognitive-thermodynamic-analyzer.util';
import { computeInformationGeometrySnapshot } from '../utils/information-geometry.util';
import { computeVariationalCognitivePhysicsSnapshot } from '../utils/variational-cognitive-physics.util';
import { projectKernelToLegacyTier } from '../utils/legacy-execution-projection.util';
import {
  cognitiveNcgesPreviewEnabled,
  ncgesObservabilityPreview,
} from '../utils/cognitive-execution-pipeline.util';
import {
  buildDedupRuntimeObservabilitySlice,
  shouldAttachDedupRuntimeObservability,
} from '../runtime/dedup-runtime-adapter.util';
import { RuntimeReplayPersistenceService } from './runtime-replay-persistence.service';
import { TripOrchestrationLockService } from './trip-orchestration-lock.service';
import { AgentService } from './agent.service';
import { runRouteAndRunMainChain } from './execution-gateway.route-and-run.orchestration';
import { applyRouteAndRunEntryRoutingInPlace } from '../routing/route-and-run-route-class-fork.util';
import { shouldRejectDedupForStaleTraceContract } from './execution-gateway-trace-compatibility.util';
import {
  attachRobustnessDashboardToResponse,
  tryBuildRobustnessDashboard,
} from '../utils/robustness-rollout-gateway.util';
import { TripRobustnessDashboardService } from './trip-robustness-dashboard.service';
import { GovernanceHydrationService } from '../../governance/activation/governance-hydration.service';
import { randomUUID } from 'crypto';
import { runWithLlmTraceContext } from '../../llm/token-context.storage';

/**
 * Execution Gateway — Stage 2 runtime surface: replay admission + ECPS **before** any engine runs.
 *
 * ETK: on admitted dedup replay, emits `execution_trace` (ECPS_EVAL + ARTIFACT_READ) for verifiable reconstruction.
 *
 * CEL: when MAPE + Cognitive Market are present, acts as cognitive broker — echoes portfolio asset refs on observability.
 *
 * CTL: optional `cognitive_thermodynamics` observability — energy/entropy/work partition from sealed ETK (pure analyzer).
 *
 * IGL: optional `information_geometry` — discrete Riemannian energy of τ(t) on ℳ + ECPS flow alignment (pure geometry util).
 *
 * VCPO: optional `variational_cognitive_physics` — discrete action Σ(L_k), L≈E_metric+λS−W (pure variational util).
 *
 * NCGES: optional `ncges_preview` when `COGNITIVE_NCGES_PREVIEW=1` — ECPS features → Φ → one linear graph-diffusion step (observability only).
 *
 * **Fresh execution contract:** ECPS pre-flight for dedup lives here; full `route_and_run` orchestration
 * shell (`runRouteAndRun`) delegates to `runRouteAndRunMainChain` so admission + execution pipeline share one gateway.
 */
export interface DedupReplayAdmission {
  response: RouteAndRunResponseDto;
  obsPayload: Record<string, unknown>;
}

@Injectable()
export class ExecutionGatewayService {
  private readonly logger = new Logger(ExecutionGatewayService.name);

  constructor(
    @Inject(forwardRef(() => AgentService))
    private readonly agent: AgentService,
    @Optional() private readonly requestDeduplication?: RequestDeduplicationService,
    @Optional() private readonly ecpsRuntimeBias?: EcpsRuntimeBiasService,
    @Optional() private readonly policyAgentPopulation?: PolicyAgentPopulationService,
    @Optional() private readonly cognitiveMarket?: CognitiveMarketService,
    @Optional() private readonly policyVersionRegistry?: ExecutionPolicyVersionRegistryService,
    @Optional() private readonly runtimeReplayPersistence?: RuntimeReplayPersistenceService,
    @Optional() readonly governanceHydration?: GovernanceHydrationService,
    @Optional() private readonly tripOrchestrationLock?: TripOrchestrationLockService,
    @Optional() private readonly tripRobustnessDashboard?: TripRobustnessDashboardService,
  ) {}

  /**
   * Full route_and_run orchestration (stable deadline, dedup replay admission, policy routing, exec modes, recovery).
   */
  async runRouteAndRun(request: RouteAndRunRequestDto): Promise<RouteAndRunResponseDto> {
    const routeClassFork = applyRouteAndRunEntryRoutingInPlace(request);
    if (routeClassFork) {
      this.logger.log(
        `[ExecutionGateway] route_class_fork=${routeClassFork.routeClass} depth=${routeClassFork.orchestrationDepth} actions=${routeClassFork.forkActions.join(',')} request_id=${request.request_id}`,
      );
    }
    const requestId = request.request_id?.trim() || randomUUID();
    if (!request.request_id?.trim()) {
      request.request_id = requestId;
    }
    const runChain = () => runRouteAndRunMainChain(this.agent, this, request);
    const runGuarded = this.tripOrchestrationLock
      ? () => this.tripOrchestrationLock!.runWithTripWriteLockIfNeeded(request, runChain)
      : runChain;

    return runWithLlmTraceContext(
      { requestId, stepName: 'INTAKE', subAgent: 'Orchestrator', routePath: 'GATEWAY' },
      runGuarded,
    );
  }

  /**
   * Single admission gate for request-hash dedup replay.
   * Returns `null` ⇒ caller must run the full execution pipeline (no replay shortcut).
   */
  tryAdmitDedupReplay(params: {
    request: RouteAndRunRequestDto;
    requestHash: string;
    startTime: number;
    deadline: { totalMs: number; remainingMs: () => number };
  }): DedupReplayAdmission | null {
    const { request, requestHash, startTime, deadline } = params;

    if (!this.requestDeduplication || request.options?.dry_run) {
      return null;
    }

    const cachedResponse = this.requestDeduplication.checkDuplicate(requestHash);
    if (!cachedResponse) {
      return null;
    }

    if (shouldRejectDedupForStaleTraceContract(request, cachedResponse)) {
      this.logger.debug(
        `[ExecutionGateway] dedup bypass: stale trace contract under cid-aware mode request_id=${request.request_id}`,
      );
      return null;
    }

    const gate = evaluateDedupConfidenceGate(cachedResponse, request);
    if (gate.action === 'BYPASS_DEDUP_FORCE_FRESH') {
      this.logger.debug(
        `[ExecutionGateway] ECPS denied dedup replay: ${gate.reason} request_id=${request.request_id}`,
      );
      return null;
    }

    const dedupedResponse: RouteAndRunResponseDto = {
      ...cachedResponse,
      request_id: request.request_id,
      observability: {
        ...cachedResponse.observability,
        latency_ms: Date.now() - startTime,
      },
    };

    const ecpsCtx = buildExecutionControlContext({
      request,
      cachedResponse,
      nowMs: Date.now(),
    });
    if (ecpsCtx) {
      let decision;
      let policyVersionId: string | undefined;
      let policyAgentId: string | undefined;
      let policySelectionScore: number | undefined;

      if (this.policyAgentPopulation) {
        const resolved = this.policyAgentPopulation.resolveForRequest({
          ecpsCtx,
          request,
        });
        decision = interpretExecutionPolicyIR(ecpsCtx, resolved.agent.ecps);
        policyAgentId = resolved.agent.policyId;
        policyVersionId = resolved.agent.policyId;
        policySelectionScore = resolved.selectionScore;
      } else if (this.policyVersionRegistry) {
        const resolved = this.policyVersionRegistry.resolveForRequest({
          ecpsCtx,
          request,
        });
        decision = interpretExecutionPolicyIR(ecpsCtx, resolved.version.policyIR);
        policyVersionId = resolved.version.versionId;
        policySelectionScore = resolved.selectionScore;
      } else {
        const bias = this.ecpsRuntimeBias?.getBias();
        decision = decideExecution(ecpsCtx, bias);
      }

      const emitter = new ExecutionTraceEmitter({
        traceId: newExecutionTraceId(),
        artifactId: ecpsCtx.artifactId,
        decision,
        engine: projectKernelToLegacyTier(decision.kernel, ecpsCtx.modeHint),
        provenance: ecpsCtx.provenance,
        confidence: ecpsCtx.replayConfidence,
        anomalies: ecpsCtx.anomalies,
      });
      emitter.emit({
        type: 'ECPS_EVAL',
        input: {
          replayEligibility: ecpsCtx.replayEligibility,
          freshnessKeys: Object.keys(ecpsCtx.freshness ?? {}),
        },
        output: decision,
      });
      emitter.emit({
        type: 'ARTIFACT_READ',
        input: { surface: 'request_hash_dedup', requestHashPrefix: requestHash.slice(0, 12) },
        output: { admitted: true },
      });
      const sealedTrace = emitter.seal();
      attachExecutionTraceToResponse(dedupedResponse, sealedTrace);

      const analysis = analyzeExecutionTrace({
        expectedDecision: decision,
        trace: sealedTrace,
      });

      const ctl = analyzeCognitiveThermodynamics({
        trace: sealedTrace,
        latencyMs: dedupedResponse.observability.latency_ms ?? 0,
        decision,
        deviationCount: analysis.deviationSignals.length,
      });

      const igl = computeInformationGeometrySnapshot({ trace: sealedTrace });

      const vcpo = computeVariationalCognitivePhysicsSnapshot({ trace: sealedTrace });

      const cognitiveRefs =
        policyAgentId != null && this.policyAgentPopulation
          ? this.policyAgentPopulation.get(policyAgentId)?.cognitiveArtifactRefs
          : undefined;

      dedupedResponse.observability = {
        ...dedupedResponse.observability,
        cognitive_thermodynamics: ctl,
        information_geometry: igl,
        variational_cognitive_physics: vcpo,
        ...(cognitiveNcgesPreviewEnabled()
          ? { ncges_preview: ncgesObservabilityPreview(decision, ecpsCtx.artifactId) }
          : {}),
        ...(shouldAttachDedupRuntimeObservability()
          ? {
              runtime_materialization: buildDedupRuntimeObservabilitySlice({
                requestId: request.request_id,
                artifactId: ecpsCtx.artifactId,
                decision,
                replayEligible: true,
              }),
            }
          : {}),
        ...(policyVersionId != null
          ? {
              active_execution_policy_version_id: policyVersionId,
              policy_selection_score: policySelectionScore,
              ...(policyAgentId != null ? { active_policy_agent_id: policyAgentId } : {}),
              ...(cognitiveRefs?.length || this.cognitiveMarket
                ? {
                    cognitive_economy: {
                      ...(cognitiveRefs?.length ? { referenced_assets: cognitiveRefs } : {}),
                      ...(this.cognitiveMarket ? { broker_revision: 'CEL/v1' } : {}),
                    },
                  }
                : {}),
            }
          : {}),
      };

      this.ecpsRuntimeBias?.applySignals(derivePolicyCorrectionSignals(analysis));
    }

    this.logger.debug(`ExecutionGateway: admitted dedup replay request_id=${request.request_id}`);

    void this.runtimeReplayPersistence
      ?.persistDedupReplayAnchor({
        request,
        requestHash,
        response: dedupedResponse,
      })
      .catch((err: unknown) =>
        this.logger.warn(
          `dedup replay anchor persist: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );

    return {
      response: dedupedResponse,
      obsPayload: {
        mode_final: 'DEDUP',
        fallback_used: false,
        deadline_ms: deadline.totalMs,
        time_remaining_ms: deadline.remainingMs(),
      },
    };
  }

  /**
   * Post-orchestration enrichment: dual-dimension Robustness Rollout → observability + payload.
   * Best-effort; failures are logged and do not fail the gateway response.
   */
  enrichResponseWithRobustnessRollout(
    request: RouteAndRunRequestDto,
    response: RouteAndRunResponseDto,
  ): RouteAndRunResponseDto {
    try {
      const dashboard = tryBuildRobustnessDashboard(request, response);
      if (!dashboard) {
        return response;
      }
      this.logger.debug(
        `[ExecutionGateway] robustness_rollout physical=${Math.round(dashboard.physical_robustness_score * 100)}% org=${Math.round(dashboard.organizational_robustness_score * 100)}% request_id=${request.request_id}`,
      );
      this.tripRobustnessDashboard?.scheduleCacheDashboard(request.trip_id, dashboard);
      return attachRobustnessDashboardToResponse(response, dashboard);
    } catch (err: unknown) {
      this.logger.warn(
        `[ExecutionGateway] robustness_rollout skipped: ${err instanceof Error ? err.message : String(err)} request_id=${request.request_id}`,
      );
      return response;
    }
  }
}
