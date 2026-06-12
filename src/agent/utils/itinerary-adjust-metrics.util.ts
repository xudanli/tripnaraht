/**
 * ITINERARY_ADJUST / POI_SLOT_FILL 漏斗埋点（结构化日志 + Prometheus）。
 */

import { Logger } from '@nestjs/common';
import type { PrometheusMetricsService } from '../../monitoring/prometheus-metrics.service';

const funnelLogger = new Logger('ItineraryAdjustFunnel');

export type ItineraryAdjustFunnelStage =
  | 'draft_created'
  | 'apply_clicked'
  | 'auto_apply'
  | 'user_apply';

export type ItineraryAdjustFunnelOutcome = 'success' | 'failure' | 'skipped';

export type ItineraryAdjustFunnelParams = {
  stage: ItineraryAdjustFunnelStage;
  outcome: ItineraryAdjustFunnelOutcome;
  sub_intent?: string;
  execution_mode?: string;
  reason?: string;
  trip_id?: string;
  request_id?: string;
  added_count?: number;
  applied_days?: number;
};

export function recordItineraryAdjustFunnel(
  prometheus: PrometheusMetricsService | undefined,
  params: ItineraryAdjustFunnelParams,
): void {
  const labels = {
    stage: params.stage,
    outcome: params.outcome,
    sub_intent: params.sub_intent ?? 'unknown',
    execution_mode: params.execution_mode ?? 'unknown',
    reason: params.reason ?? 'none',
  };

  prometheus?.recordItineraryAdjustFunnel(labels);

  funnelLogger.log(
    JSON.stringify({
      event: 'itinerary_adjust_funnel',
      ...params,
      ...labels,
    }),
  );
}
