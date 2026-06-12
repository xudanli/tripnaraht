import { Injectable, Logger } from '@nestjs/common';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { OrchestrationPolicyDecision } from '../utils/orchestration-policy.util';
import type { RoutingSignals } from '../utils/orchestration-signals.util';
import type {
  RoutingClassifierEvalSampleV1,
  ShadowRoutingEvalV1,
} from '../routing/routing-classifier-eval.types';
import { buildRoutingSignalsFeatureVector } from '../routing/routing-signals-feature.util';
import {
  analyzeRoutingTierMismatch,
  predictExperimentalRoutingTier,
  projectProductionRoutingTier,
} from '../routing/routing-tier-projection.util';
export interface ShadowRoutingEvalInput {
  traceId: string;
  request: RouteAndRunRequestDto;
  signals: RoutingSignals;
  decision: OrchestrationPolicyDecision;
  modeLockActive?: boolean;
}

@Injectable()
export class ShadowRoutingEvaluatorService {
  private readonly logger = new Logger(ShadowRoutingEvaluatorService.name);

  isEnabled(): boolean {
    const raw = (process.env.ROUTING_SHADOW_EVAL ?? '1').trim().toLowerCase();
    return raw !== '0' && raw !== 'false' && raw !== 'off';
  }

  /**
   * Fast synchronous shadow eval (<1ms) — attaches to observability.trace.
   */
  evaluateSync(input: ShadowRoutingEvalInput): ShadowRoutingEvalV1 {
    const start = Date.now();
    const features = buildRoutingSignalsFeatureVector(input);
    const productionRouting = projectProductionRoutingTier(input.signals, input.decision);
    const shadowRouting = predictExperimentalRoutingTier(input.signals);
    const mismatchType = analyzeRoutingTierMismatch(productionRouting, shadowRouting);
    const isMatch = mismatchType === 'NONE';
    const latencyMs = Date.now() - start;

    const metrics: ShadowRoutingEvalV1 = {
      schemaId: 'tripnara.shadow_routing_eval@v1',
      version: 1,
      traceId: input.traceId,
      isMatch,
      mismatchType,
      productionRouting,
      shadowRouting,
      productionOrchestrationMode: input.decision.mode,
      latencyMs,
      features,
    };

    if (!isMatch && mismatchType === 'UNDER_ROUTING') {
      this.logger.warn(
        `[SHADOW_MISMATCH][UNDER_ROUTING] trace=${input.traceId} production=${productionRouting} shadow=${shadowRouting} taskType=${input.signals.taskType}`,
      );
    } else if (!isMatch) {
      this.logger.debug(
        `[SHADOW_MISMATCH][${mismatchType}] trace=${input.traceId} production=${productionRouting} shadow=${shadowRouting}`,
      );
    }

    return metrics;
  }

  /**
   * Fire-and-forget hook for future heavy predictors (ONNX / remote classifier).
   * v0: delegates to evaluateSync inside try/catch — never throws.
   */
  scheduleAsyncEvaluation(input: ShadowRoutingEvalInput): void {
    if (!this.isEnabled()) {
      return;
    }
    void Promise.resolve()
      .then(() => this.evaluateSync(input))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `[ShadowRoutingEvaluator] async evaluation failed silently trace=${input.traceId}: ${msg}`,
        );
      });
  }

  /** Build offline eval row from a completed shadow eval (ground truth from tier projection = deterministic baseline). */
  toEvalSample(
    input: ShadowRoutingEvalInput,
    shadow: ShadowRoutingEvalV1,
    annotatorNotes?: string,
  ): RoutingClassifierEvalSampleV1 {
    const productionRouting = shadow.productionRouting;
    return {
      schemaId: 'tripnara.routing_classifier_eval@v1',
      version: 1,
      sample_id: input.traceId,
      timestamp: new Date().toISOString(),
      features: shadow.features,
      ground_truth: {
        targetRouting: productionRouting,
        isAsync: String(input.request.options?.async_mode ?? 'OFF').toUpperCase() !== 'OFF',
        annotatorNotes,
      },
      current_rule_output: {
        actualRouting: productionRouting,
        orchestrationMode: input.decision.mode,
        latencyMs: shadow.latencyMs,
      },
      shadow_output: {
        shadowRouting: shadow.shadowRouting,
        isMatch: shadow.isMatch,
        mismatchType: shadow.mismatchType,
        latencyMs: shadow.latencyMs,
      },
    };
  }

}
