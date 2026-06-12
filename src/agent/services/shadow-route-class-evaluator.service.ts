import { Injectable, Logger } from '@nestjs/common';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { OrchestrationPolicyDecision } from '../utils/orchestration-policy.util';
import type { RoutingSignals } from '../utils/orchestration-signals.util';
import { classifyRouteAndRunRouteClass } from '../routing/route-and-run-route-class.util';
import type { ShadowRouteClassEvalV1 } from '../routing/route-and-run-routing-protocol.types';
import {
  analyzeRouteClassDrift,
  inferProductionRouteClassProxy,
  routeClassDepth,
} from '../routing/route-and-run-route-class-projection.util';

export interface ShadowRouteClassEvalInput {
  traceId: string;
  request: RouteAndRunRequestDto;
  signals: RoutingSignals;
  decision: OrchestrationPolicyDecision;
}

@Injectable()
export class ShadowRouteClassEvaluatorService {
  private readonly logger = new Logger(ShadowRouteClassEvaluatorService.name);

  isEnabled(): boolean {
    const raw = (process.env.ROUTE_CLASS_SHADOW_EVAL ?? '1').trim().toLowerCase();
    return raw !== '0' && raw !== 'false' && raw !== 'off';
  }

  evaluateSync(input: ShadowRouteClassEvalInput): ShadowRouteClassEvalV1 {
    const start = Date.now();
    const protocol = classifyRouteAndRunRouteClass(input.request);
    const production = inferProductionRouteClassProxy(
      input.request,
      input.signals,
      input.decision,
    );
    const mismatchType = analyzeRouteClassDrift(protocol.routeClass, production.routeClass);
    const isMatch = mismatchType === 'NONE';
    const latencyMs = Date.now() - start;

    const metrics: ShadowRouteClassEvalV1 = {
      schemaId: 'tripnara.route_class_eval@v1',
      version: 1,
      traceId: input.traceId,
      isMatch,
      mismatchType,
      protocolRouteClass: protocol.routeClass,
      productionRouteClass: production.routeClass,
      protocolMatchedRule: protocol.matchedRule,
      productionMatchedRule: production.matchedRule,
      protocolDepth: routeClassDepth(protocol.routeClass),
      productionDepth: routeClassDepth(production.routeClass),
      deepResearchV71: protocol.deepResearchV71,
      taskType: input.signals.taskType,
      orchestrationMode: input.decision.mode,
      latencyMs,
    };

    if (!isMatch && (mismatchType === 'OVER_DEPTH' || mismatchType === 'UNDER_DEPTH')) {
      this.logger.warn(
        `[ROUTE_CLASS_DRIFT][${mismatchType}] trace=${input.traceId} protocol=${protocol.routeClass} production=${production.routeClass} taskType=${input.signals.taskType}`,
      );
    } else if (!isMatch) {
      this.logger.debug(
        `[ROUTE_CLASS_DRIFT][${mismatchType}] trace=${input.traceId} protocol=${protocol.routeClass} production=${production.routeClass}`,
      );
    }

    return metrics;
  }

  scheduleAsyncEvaluation(input: ShadowRouteClassEvalInput): void {
    if (!this.isEnabled()) {
      return;
    }
    void Promise.resolve()
      .then(() => this.evaluateSync(input))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `[ShadowRouteClassEvaluator] async failed trace=${input.traceId}: ${msg}`,
        );
      });
  }
}
