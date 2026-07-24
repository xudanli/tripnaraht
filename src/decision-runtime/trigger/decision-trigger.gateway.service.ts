/**
 * Decision Trigger Gateway — single formal entry normalization + dispatch.
 * @see DECISION_RUNTIME_MATURITY.md §8 P1
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrometheusMetricsService } from '../../monitoring/prometheus-metrics.service';
import type {
  DecisionRunDispatchResult,
  DecisionRunRequest,
  DecisionTriggerInput,
} from '../contracts/decision-run-request';
import { DECISION_RUN_DISPATCH_SCHEMA_ID } from '../contracts/decision-run-request';
import {
  isDecisionTriggerGatewayEnabled,
  isDecisionTriggerLineageEnabled,
} from './decision-trigger.config';
import { evaluateReplanningTrigger } from './replanning-trigger.policy';
import { isReplanningTriggerPolicyEnabled } from './replanning-trigger.config';
import { toReplanningTriggerDecision } from './replanning-trigger-decision.util';
import { MonitoringReplanningContextService } from './monitoring-replanning-context.service';
import { normalizeDecisionTriggerInput } from './decision-trigger-normalizer.util';
import { DecisionTriggerLineageStore } from './decision-trigger-lineage.store';
import { FullPlanSelectionService } from '../core/full-plan-selection.service';
import { DecisionTriggerCanonicalEvaluateHandler } from './decision-trigger-canonical-evaluate.handler';
import { EvidenceResolverService } from '../../trips/guardian-decision-core/evidence/evidence-resolver.service';
import { WeatherActivityProhibitedPipelineService } from '../../trips/guardian-decision-core/detection/weather-activity-prohibited-pipeline.service';
import { ExcessiveDailyLoadPipelineService } from '../../trips/guardian-decision-core/detection/excessive-daily-load-pipeline.service';
import { SnapshotTriggerEnrichmentService } from '../snapshot/snapshot-trigger-enrichment.service';

@Injectable()
export class DecisionTriggerGatewayService {
  private readonly logger = new Logger(DecisionTriggerGatewayService.name);

  constructor(
    private readonly lineage: DecisionTriggerLineageStore,
    private readonly fullPlanSelection: FullPlanSelectionService,
    private readonly canonicalEvaluate: DecisionTriggerCanonicalEvaluateHandler,
    private readonly evidenceResolver: EvidenceResolverService,
    private readonly weatherPipeline: WeatherActivityProhibitedPipelineService,
    private readonly loadPipeline: ExcessiveDailyLoadPipelineService,
    @Optional() private readonly monitoringReplanning?: MonitoringReplanningContextService,
    @Optional() private readonly prometheus?: PrometheusMetricsService,
    @Optional() private readonly snapshotEnrichment?: SnapshotTriggerEnrichmentService,
  ) {}

  isEnabled(): boolean {
    return isDecisionTriggerGatewayEnabled();
  }

  /** Normalize only — safe to call when gateway flag is off (for shadow lineage). */
  buildRunRequest(input: DecisionTriggerInput): DecisionRunRequest {
    const request = normalizeDecisionTriggerInput(input);
    if (isReplanningTriggerPolicyEnabled()) {
      const replanning = evaluateReplanningTrigger({
        tripId: input.tripId,
        triggerKind: input.kind,
        problemId: input.problemId,
        eventSeverity: input.metadata?.eventSeverity as
          | 'LOW'
          | 'MEDIUM'
          | 'HIGH'
          | undefined,
        affectsEffectivePlan: input.metadata?.affectsEffectivePlan as boolean | undefined,
        decisionRecordStale: input.metadata?.decisionRecordStale as boolean | undefined,
        metadata: input.metadata,
      });
      request.metadata = {
        ...(request.metadata ?? {}),
        replanningTrigger: replanning,
        replanningDecision: toReplanningTriggerDecision(replanning, {
          eventSeverity: input.metadata?.eventSeverity as 'LOW' | 'MEDIUM' | 'HIGH' | undefined,
        }),
      };
    }
    if (isDecisionTriggerLineageEnabled()) {
      this.lineage.append(request.tripId, request);
    }
    return request;
  }

  /**
   * Full dispatch — requires DECISION_TRIGGER_GATEWAY_ENABLED=1.
   * Legacy callers should keep direct paths when flag is off.
   */
  async dispatch(input: DecisionTriggerInput): Promise<DecisionRunDispatchResult> {
    if (!this.isEnabled()) {
      throw new Error(
        'Decision Trigger Gateway disabled (set DECISION_TRIGGER_GATEWAY_ENABLED=1)',
      );
    }

    const enrichedMonitoring = await this.enrichMonitoringInput(input);
    const withSnapshot = this.snapshotEnrichment
      ? await this.snapshotEnrichment.enrichIfMissing(enrichedMonitoring)
      : enrichedMonitoring;
    const request = this.buildRunRequest(withSnapshot);
    this.logger.debug(
      `[TriggerGateway] dispatch runId=${request.runId} target=${request.routeTarget} kind=${request.triggerKind}`,
    );

    try {
      const result = await this.dispatchByRoute(request, withSnapshot);
      const dispatchResult: DecisionRunDispatchResult = {
        schemaId: DECISION_RUN_DISPATCH_SCHEMA_ID,
        runId: request.runId,
        routeTarget: request.routeTarget,
        status: 'COMPLETED',
        request,
        result,
      };
      this.prometheus?.recordDecisionTriggerDispatch({
        routeTarget: request.routeTarget,
        status: dispatchResult.status,
      });
      return dispatchResult;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[TriggerGateway] dispatch failed runId=${request.runId}: ${message}`,
      );
      const dispatchResult: DecisionRunDispatchResult = {
        schemaId: DECISION_RUN_DISPATCH_SCHEMA_ID,
        runId: request.runId,
        routeTarget: request.routeTarget,
        status: 'FAILED',
        request,
        error: { code: 'DISPATCH_FAILED', message },
      };
      this.prometheus?.recordDecisionTriggerDispatch({
        routeTarget: request.routeTarget,
        status: dispatchResult.status,
      });
      return dispatchResult;
    }
  }

  listLineage(tripId: string) {
    return this.lineage.list(tripId);
  }

  private async enrichMonitoringInput(
    input: DecisionTriggerInput,
  ): Promise<DecisionTriggerInput> {
    if (
      input.kind !== 'CANONICAL_MONITORING_POLL' ||
      !this.monitoringReplanning ||
      input.metadata?.eventSeverity != null
    ) {
      return input;
    }

    const pollKind = input.monitoring?.pollKind;
    if (!pollKind) {
      return input;
    }

    const pollMetadata = await this.monitoringReplanning.buildPollMetadata(
      input.tripId,
      pollKind,
    );

    return {
      ...input,
      metadata: { ...(input.metadata ?? {}), ...pollMetadata },
    };
  }

  private async dispatchByRoute(
    request: DecisionRunRequest,
    input: DecisionTriggerInput,
  ): Promise<unknown> {
    if (request.metadata?.entryPointId === 'agent.route-and-run') {
      return this.dispatchAgentRouteAndRunAck(request);
    }

    switch (request.routeTarget) {
      case 'FULL_PLAN_SELECTION':
        return this.dispatchFullPlanSelection(request, input);
      case 'CANONICAL_L2_EVALUATE':
        if (
          request.triggerKind === 'IN_TRIP_DEVIATION' &&
          request.metadata?.entryPointId === 'loops.in-trip-recovery'
        ) {
          return this.dispatchInTripRecoveryAck(request);
        }
        if (
          request.triggerKind === 'MANUAL_REPAIR_REQUEST' &&
          (request.metadata?.entryPointId === 'user.feasibility-apply-repair' ||
            request.metadata?.entryPointId === 'user.readiness-apply-repair')
        ) {
          return this.dispatchManualRepairAck(request);
        }
        return this.canonicalEvaluate.evaluate(request);
      case 'CANONICAL_MONITORING':
        if (
          request.triggerKind === 'WORLD_EVENT' &&
          request.metadata?.entryPointId === 'kernel.replan-coordinator'
        ) {
          return this.dispatchKernelReplanAck(request);
        }
        return this.dispatchMonitoring(request, input);
      case 'AGENTIC_ORCHESTRATION':
        if (
          request.triggerKind === 'USER_INTENT' &&
          request.metadata?.entryPointId === 'user.trip-edit'
        ) {
          return this.dispatchUserIntentPostEdit(request);
        }
        return {
          delegated: true,
          message:
            'Route target not yet wired; continue via existing orchestrator entry',
          routeTarget: request.routeTarget,
        };
      case 'LEGACY_DECISION_ENGINE':
        return {
          delegated: true,
          message:
            'Route target not yet wired; continue via existing orchestrator entry',
          routeTarget: request.routeTarget,
        };
      default:
        return {
          status: 'UNSUPPORTED',
          routeTarget: request.routeTarget,
          triggerKind: request.triggerKind,
        };
    }
  }

  private async dispatchFullPlanSelection(
    request: DecisionRunRequest,
    input: DecisionTriggerInput,
  ) {
    const payload = input.fullPlanSelection;
    if (!payload) {
      throw new Error('FULL_PLAN_SELECTION requires fullPlanSelection payload');
    }

    const problemId =
      payload.problemId ?? request.runId ?? `full_plan_${request.tripId}_${Date.now()}`;

    if (payload.operation === 'evaluate_only') {
      return this.fullPlanSelection.evaluatePrebuiltCandidates({
        worldState: payload.worldState,
        context: payload.context,
        candidates: payload.prebuiltCandidates ?? [],
        problemId,
      });
    }

    if (payload.prebuiltCandidates?.length) {
      return this.fullPlanSelection.selectFromPrebuiltCandidates({
        worldState: payload.worldState,
        context: payload.context,
        candidates: payload.prebuiltCandidates,
        problemId,
        constraintReportsByCandidateId: payload.constraintReportsByCandidateId,
      });
    }

    return this.fullPlanSelection.selectRecommendedPlan({
      worldState: payload.worldState,
      context: payload.context,
      problemId,
    });
  }

  private async dispatchMonitoring(
    request: DecisionRunRequest,
    input: DecisionTriggerInput,
  ) {
    const monitoring = input.monitoring;
    if (!monitoring) {
      throw new Error('CANONICAL_MONITORING requires monitoring payload');
    }

    const { tripId } = request;

    if (monitoring.pollKind === 'WEATHER_HAZARD') {
      if (monitoring.dayIndex == null) {
        throw new Error('WEATHER_HAZARD poll requires dayIndex');
      }
      const evidenceOnly = await this.evidenceResolver.fetchAndResolveWeatherIfChanged({
        tripId,
        dayIndex: monitoring.dayIndex,
      });
      if (!evidenceOnly) {
        return { ok: true, changed: false, result: null };
      }
      const result = await this.weatherPipeline.runFromResolvedEvidence(
        tripId,
        evidenceOnly,
      );
      if (monitoring.runFull && result.problem) {
        const run = await this.canonicalEvaluate.evaluate({
          ...request,
          problemId: result.problem.problemId,
          routeTarget: 'CANONICAL_L2_EVALUATE',
          triggerKind: 'CANONICAL_PROBLEM_EVALUATE',
        });
        return { ok: true, changed: true, runFull: true, ...(run as object) };
      }
      return { ok: true, changed: true, result };
    }

    const scan = await this.loadPipeline.scanTrip(tripId);
    if (!scan) {
      return { ok: true, overloaded: false, result: null };
    }
    if (monitoring.runFull && scan.problem) {
      const run = await this.canonicalEvaluate.evaluate({
        ...request,
        problemId: scan.problem.problemId,
        routeTarget: 'CANONICAL_L2_EVALUATE',
        triggerKind: 'CANONICAL_PROBLEM_EVALUATE',
      });
      return { ok: true, overloaded: true, runFull: true, ...(run as object) };
    }
    return { ok: true, overloaded: true, ...scan };
  }

  private dispatchUserIntentPostEdit(request: DecisionRunRequest) {
    return {
      schemaId: 'tripnara.user_intent_post_edit@v1' as const,
      acknowledged: true,
      entryPointId: String(request.metadata?.entryPointId ?? 'unknown'),
      intent: String(request.metadata?.intent ?? 'unknown'),
      runId: request.runId,
      triggerKind: request.triggerKind,
      replanningDecision: request.metadata?.replanningDecision,
      message:
        'User edit applied via legacy write path; Gateway recorded lineage and replanning policy',
    };
  }

  private dispatchInTripRecoveryAck(request: DecisionRunRequest) {
    const skipped = request.metadata?.skipped;
    return {
      schemaId: 'tripnara.in_trip_recovery_dispatch@v1' as const,
      acknowledged: true,
      entryPointId: 'loops.in-trip-recovery',
      runId: request.runId,
      triggerKind: request.triggerKind,
      skipped: typeof skipped === 'string' ? skipped : undefined,
      replanningDecision: request.metadata?.replanningDecision,
      loopDelegated: !skipped,
      message: skipped
        ? 'In-trip recovery skipped by replanning policy; Gateway lineage recorded'
        : 'In-trip recovery delegated to LoopOrchestrator; Gateway lineage recorded',
    };
  }

  private dispatchKernelReplanAck(request: DecisionRunRequest) {
    const skipped = request.metadata?.skipped;
    return {
      schemaId: 'tripnara.kernel_replan_dispatch@v1' as const,
      acknowledged: true,
      entryPointId: 'kernel.replan-coordinator',
      runId: request.runId,
      triggerKind: request.triggerKind,
      reason: request.metadata?.reason,
      skipped: typeof skipped === 'string' ? skipped : undefined,
      replanningDecision: request.metadata?.replanningDecision,
      kernelDelegated: !skipped,
      message: skipped
        ? 'Kernel full replan skipped by replanning policy; Gateway lineage recorded'
        : 'Kernel full replan delegated to ReplanCoordinator; Gateway lineage recorded',
    };
  }

  private dispatchManualRepairAck(request: DecisionRunRequest) {
    return {
      schemaId: 'tripnara.manual_repair_dispatch@v1' as const,
      acknowledged: true,
      entryPointId: String(request.metadata?.entryPointId ?? 'unknown'),
      runId: request.runId,
      triggerKind: request.triggerKind,
      issueId: request.metadata?.issueId,
      replanningDecision: request.metadata?.replanningDecision,
      repairDelegated: true,
      message:
        'Manual repair delegated to legacy apply-repair path; Gateway lineage recorded',
    };
  }

  private dispatchAgentRouteAndRunAck(request: DecisionRunRequest) {
    return {
      schemaId: 'tripnara.agent_route_and_run_dispatch@v1' as const,
      acknowledged: true,
      advisoryOnly: true,
      entryPointId: 'agent.route-and-run',
      runId: request.runId,
      triggerKind: request.triggerKind,
      replanningDecision: request.metadata?.replanningDecision,
      message:
        'Agent route_and_run advisory dispatch; no formal Decision or Effective Plan authority',
    };
  }
}
