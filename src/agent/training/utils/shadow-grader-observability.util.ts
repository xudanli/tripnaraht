import type { ShadowGraderAggregateMetrics } from '../interfaces/shadow-deployment.types';
import type { ShadowGraderScheduleMark } from './shadow-grader-request-mark.util';
import { parseHarnessShadowGraderEnabled } from './harness-shadow-grader-mode.util';

export interface ShadowGraderObservabilityV1 {
  schemaId: 'tripnara.shadow_grader@v1';
  version: 1;
  enabled: boolean;
  active_shadow_version: string | null;
  scheduled: boolean;
  skip_reason?: ShadowGraderScheduleMark['skip_reason'];
  aggregate?: Pick<
    ShadowGraderAggregateMetrics,
    'sampleCount' | 'shadowWinRate' | 'promotionReady'
  >;
}

export function buildShadowGraderObservabilitySlice(params: {
  requestId: string;
  scheduleMark?: ShadowGraderScheduleMark;
  activeShadowVersion?: string | null;
  aggregate?: ShadowGraderAggregateMetrics | null;
}): ShadowGraderObservabilityV1 {
  const enabled = parseHarnessShadowGraderEnabled();
  const mark = params.scheduleMark;
  const slice: ShadowGraderObservabilityV1 = {
    schemaId: 'tripnara.shadow_grader@v1',
    version: 1,
    enabled,
    active_shadow_version: params.activeShadowVersion ?? null,
    scheduled: mark?.scheduled === true,
    ...(mark?.skip_reason ? { skip_reason: mark.skip_reason } : {}),
  };
  if (params.aggregate && params.activeShadowVersion) {
    slice.aggregate = {
      sampleCount: params.aggregate.sampleCount,
      shadowWinRate: params.aggregate.shadowWinRate,
      promotionReady: params.aggregate.promotionReady,
    };
  }
  return slice;
}
