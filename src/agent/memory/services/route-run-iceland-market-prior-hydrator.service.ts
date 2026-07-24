// src/agent/memory/services/route-run-iceland-market-prior-hydrator.service.ts

import { Injectable, Logger } from '@nestjs/common';
import type { RouteAndRunRequestDto } from '../../dto/route-and-run.dto';
import type { AgentMemoryContext } from '../interfaces/agent-memory-context.interface';
import { extractIcelandMarketRoutingInput } from '../../../trips/iceland/market-preference/extract-iceland-market-routing-input.util';
import { writeIcelandMarketSegmentToTravelPreference } from '../../../trips/iceland/market-preference/iceland-market-preference-memory.util';
import { ICELAND_MARKET_PRIOR_SYSTEM_HINT_KEY } from '../utils/iceland-market-preference-prompt.util';
import { resolveIcelandMarketSegment } from '../../../trips/iceland/market-preference/resolve-iceland-market-segment';
import { loadIcelandMarketPreferenceMatrix } from '../../../trips/iceland/market-preference/load-iceland-market-preference-matrix';

/**
 * route_and_run：将隐式市场画像写入 `travelPreference.iceland_market_segment`（只读快照，供决策与解释层消费）。
 */
@Injectable()
export class RouteRunIcelandMarketPriorHydratorService {
  private readonly logger = new Logger(RouteRunIcelandMarketPriorHydratorService.name);

  hydrate(request: RouteAndRunRequestDto, memory: AgentMemoryContext): void {
    if (process.env.ICELAND_MARKET_PRIOR === '0') return;

    const routingInput = extractIcelandMarketRoutingInput(memory, request);
    const resolution = resolveIcelandMarketSegment(routingInput);
    if (!resolution) return;

    writeIcelandMarketSegmentToTravelPreference(memory, resolution);

    const matrix = loadIcelandMarketPreferenceMatrix();
    const fullApply =
      resolution.confidence >= matrix.confidence_apply_full &&
      !!resolution.routeDirectionName;
    const existingRd =
      typeof request.route_direction_id === 'string' ? request.route_direction_id.trim() : '';
    if (fullApply && !existingRd) {
      request.route_direction_id = resolution.routeDirectionName;
    }

    if (resolution.promptBlockZh && process.env.ROUTE_RUN_ICELAND_MARKET_TRANSIENT_ON_REQUEST === '1') {
      (request as unknown as Record<string, unknown>)[ICELAND_MARKET_PRIOR_SYSTEM_HINT_KEY] =
        resolution.promptBlockZh;
    }

    const shadow = process.env.ICELAND_MARKET_PRIOR_SHADOW === '1';
    const apply = process.env.ICELAND_MARKET_PRIOR === '1';

    this.logger.debug(
      `[IcelandMarketPrior] segment=${resolution.segmentId} confidence=${resolution.confidence.toFixed(2)} ` +
        `canonical=${resolution.canonicalRouteId} route_direction=${resolution.routeDirectionName ?? 'n/a'} ` +
        `auto_bound=${fullApply && !existingRd} shadow=${shadow} apply_env=${apply}`,
    );
  }
}
