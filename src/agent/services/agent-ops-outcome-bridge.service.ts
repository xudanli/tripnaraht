import { Injectable, Logger, Optional } from '@nestjs/common';
import type { TripWorldState } from '../../trips/decision/world-model';
import { OpsRealityAuditService } from '../../trips/decision/services/ops-reality-audit.service';
import { CausalRuntimeSessionService } from '../../trips/causal-runtime/causal-runtime-session.service';
import { buildCausalRuntimeEcho } from '../../trips/causal-runtime/causal-runtime-echo.util';
import { CausalCounterfactualClosureService } from '../../trips/causal-runtime/causal-counterfactual-closure.service';
import { enrichOpsOutcomeWithSession } from '../../trips/causal-runtime/enrich-ops-outcome-with-session.util';
import {
  asTripWorldState,
  asWorldStateRecord,
} from '../../trips/causal-runtime/coerce-trip-world-state.util';
import type { OpsRealityOutcomePayloadV1 } from '../../trips/decision/observability/ops-reality-audit-payload';
import {
  mergeOutcomeTelemetryRefs,
  OPS_REALITY_OUTCOME_SCHEMA,
} from '../../trips/decision/observability/ops-reality-audit-payload';
import { applyPrismaTripIdToWorldState } from '../../trips/execution-closure-persistence/apply-prisma-trip-id-to-world-state';
import {
  CAUSAL_OBSERVATION_EXTENSION_SCHEMA,
  type CausalObservationExtension,
} from '../../trips/causal-runtime/counterfactual/extract-causal-observation-from-ops-outcome.util';

export interface AgentOpsOutcomeInput {
  tripId: string;
  outcome: Record<string, unknown>;
  snapshotId?: string;
  causality_id?: string;
  state?: TripWorldState;
  source?: string;
  trip_run_id?: string;
  execution_trace_id?: string;
  /** When set, merged into outcome.extensions.causal_observation */
  causalObservation?: {
    metrics: Record<string, number>;
    missed_appointment?: boolean;
    narrative?: string;
  };
}

export interface AgentOpsOutcomeResult {
  ok: boolean;
  snapshotId?: string;
  stateAutoFilled?: boolean;
  causalityAutoFilled?: boolean;
  snapshotAutoFilled?: boolean;
  causalCounterfactualClosed?: boolean;
  causalCounterfactualReport?: unknown;
  travelEventPersisted?: boolean;
  error?: string;
}

/**
 * Agent layer bridge — auto-attach TripWorldState + causality_id from server session when recording OPS outcome.
 */
@Injectable()
export class AgentOpsOutcomeBridgeService {
  private readonly logger = new Logger(AgentOpsOutcomeBridgeService.name);

  constructor(
    @Optional() private readonly causalSession?: CausalRuntimeSessionService,
    @Optional() private readonly opsRealityAudit?: OpsRealityAuditService,
    @Optional()
    private readonly causalCounterfactual?: CausalCounterfactualClosureService,
  ) {}

  /** Persist post-decision TripWorldState for later OPS / P5 join (also called from TripDecisionEngine). */
  captureDecisionWorldState(
    state: TripWorldState,
    meta?: { requestId?: string; traceRequestId?: string },
  ): void {
    this.causalSession?.capture({
      state,
      requestId: meta?.requestId,
      traceRequestId: meta?.traceRequestId,
    });
  }

  /**
   * Build OPS outcome body with session-filled state / causality_id (no HTTP hop).
   */
  buildEnrichedOutcomeBody(input: AgentOpsOutcomeInput): {
    tripId: string;
    snapshotId?: string;
    causality_id?: string;
    state?: TripWorldState;
    outcome: Record<string, unknown>;
    stateAutoFilled?: boolean;
    causalityAutoFilled?: boolean;
    snapshotAutoFilled?: boolean;
  } {
    const session = this.causalSession?.getForTrip(input.tripId);
    const enriched = enrichOpsOutcomeWithSession(
      {
        tripId: input.tripId,
        causality_id: input.causality_id,
        state: asWorldStateRecord(input.state),
        snapshotId: input.snapshotId,
      },
      session,
    );

    const outcome = this.mergeCausalObservation(input.outcome, input.causalObservation);

    return {
      tripId: enriched.tripId ?? input.tripId,
      snapshotId: enriched.snapshotId,
      causality_id: enriched.causality_id,
      state: asTripWorldState(enriched.state),
      outcome,
      stateAutoFilled: enriched.stateAutoFilled,
      causalityAutoFilled: enriched.causalityAutoFilled,
      snapshotAutoFilled: enriched.snapshotAutoFilled,
    };
  }

  /**
   * Record OPS reality outcome with auto-filled session state → triggers P5 when enabled.
   */
  async recordRealityOutcome(input: AgentOpsOutcomeInput): Promise<AgentOpsOutcomeResult> {
    if (!this.opsRealityAudit) {
      return { ok: false, error: 'OpsRealityAuditService 不可用' };
    }

    const body = this.buildEnrichedOutcomeBody(input);
    const snapshotId = body.snapshotId?.trim();
    if (!snapshotId) {
      return {
        ok: false,
        error: '缺少 ops_reality_snapshot_id（会话未捕获或 OPS_REALITY_AUDIT 未启用）',
        stateAutoFilled: body.stateAutoFilled,
        causalityAutoFilled: body.causalityAutoFilled,
      };
    }

    const causalityRef = body.causality_id?.trim();
    let mergedOutcome = mergeOutcomeTelemetryRefs(body.outcome, {
      tripRunId: input.trip_run_id,
      executionTraceId: input.execution_trace_id,
      causalityId: causalityRef,
    }) as unknown as OpsRealityOutcomePayloadV1;

    if (!mergedOutcome.schema) {
      mergedOutcome = { ...mergedOutcome, schema: OPS_REALITY_OUTCOME_SCHEMA };
    }

    const ok = await this.opsRealityAudit.recordOutcome(snapshotId, mergedOutcome, input.source);
    if (!ok) {
      return {
        ok: false,
        snapshotId,
        error: '未更新（快照不存在、已写过 outcome、或未启用 OPS_REALITY_AUDIT）',
        stateAutoFilled: body.stateAutoFilled,
        causalityAutoFilled: body.causalityAutoFilled,
        snapshotAutoFilled: body.snapshotAutoFilled,
      };
    }

    const counterfactual = await this.tryCounterfactualAfterOps({
      state: body.state,
      tripId: body.tripId,
      causalityRef,
      mergedOutcome,
      executionTraceId: input.execution_trace_id,
    });

    return {
      ok: true,
      snapshotId,
      stateAutoFilled: body.stateAutoFilled,
      causalityAutoFilled: body.causalityAutoFilled,
      snapshotAutoFilled: body.snapshotAutoFilled,
      ...counterfactual,
    };
  }

  private mergeCausalObservation(
    outcome: Record<string, unknown>,
    observation?: AgentOpsOutcomeInput['causalObservation'],
  ): Record<string, unknown> {
    if (!observation?.metrics || !Object.keys(observation.metrics).length) {
      return outcome;
    }

    const extensions =
      outcome.extensions && typeof outcome.extensions === 'object' && !Array.isArray(outcome.extensions)
        ? { ...(outcome.extensions as Record<string, unknown>) }
        : {};

    const causalBlock: CausalObservationExtension = {
      schema: CAUSAL_OBSERVATION_EXTENSION_SCHEMA,
      metrics: observation.metrics,
      missed_appointment: observation.missed_appointment,
      narrative: observation.narrative,
    };

    return {
      ...outcome,
      extensions: {
        ...extensions,
        causal_observation: causalBlock,
      },
    };
  }

  private async tryCounterfactualAfterOps(input: {
    state?: TripWorldState;
    tripId: string;
    causalityRef?: string;
    mergedOutcome: OpsRealityOutcomePayloadV1;
    executionTraceId?: string;
  }): Promise<Partial<AgentOpsOutcomeResult>> {
    if (!this.causalCounterfactual || !input.causalityRef || !input.state?.context) {
      return { causalCounterfactualClosed: false };
    }

    applyPrismaTripIdToWorldState(input.state, input.tripId);

    try {
      const closed = await this.causalCounterfactual.tryCloseFromOpsOutcome({
        state: input.state,
        causalityId: input.causalityRef,
        outcome: input.mergedOutcome,
        tripId: input.tripId,
        requestId: input.executionTraceId,
      });

      if (!closed) return { causalCounterfactualClosed: false };

      this.causalSession?.capture({ state: input.state });

      return {
        causalCounterfactualClosed: true,
        causalCounterfactualReport: closed.report,
        travelEventPersisted: closed.travelEventPersisted,
        ...buildCausalRuntimeEcho(input.state),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`[AgentOpsBridge] P5 auto-close failed: ${message}`);
      return { causalCounterfactualClosed: false, error: message };
    }
  }
}
