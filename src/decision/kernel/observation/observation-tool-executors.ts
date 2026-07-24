import type { TripObservationAction } from '../../../trips/road/trip-action.types';
import type { DecisionState } from '../decision-state.types';
import type { ObservationExecutionResult, ObservationToolExecutor } from './observation-harness.types';

/**
 * 生产默认：弱证据占位，避免无密钥环境下剧烈改写世界状态。
 */
export class DefaultObservationToolExecutor implements ObservationToolExecutor {
  async execute(action: TripObservationAction, _dso: DecisionState): Promise<ObservationExecutionResult> {
    if (action.type === 'OBSERVATION_SNS_CRAWL') {
      return {
        evidenceKind: 'station_forecast',
        evidenceWeight: 0.35,
        passability01: 0.55,
        summary: 'Default SNS stub: macro forecast only (no API keys).',
      };
    }
    return {
      evidenceKind: 'poi_operator',
      evidenceWeight: 0.45,
      poiOpen: true,
      summary: 'Default POI verify stub: assumed open.',
    };
  }
}

/**
 * 高天气风险 + 必选 POI 场景：模拟「一小时前实拍 → 封路」用于集成测试与回放。
 */
export class SenjaStormObservationExecutor implements ObservationToolExecutor {
  constructor(private readonly riskPoiIds: string[] = ['senja-high-route-poi']) {}

  async execute(action: TripObservationAction, dso: DecisionState): Promise<ObservationExecutionResult> {
    if (action.type === 'OBSERVATION_SNS_CRAWL') {
      const affected =
        this.riskPoiIds.length > 0
          ? this.riskPoiIds
          : (dso.userIntent?.mustIncludePoiIds ?? []).slice(0, 1);
      return {
        evidenceKind: 'recent_social_image',
        evidenceWeight: 0.9,
        passability01: 0.2,
        routeSegmentInfeasible: true,
        affectedPoiIds: affected.length ? affected : ['senja-high-route-poi'],
        summary: 'SNS imagery (within 1h): heavy snow; corridor impassable.',
      };
    }
    if (action.type === 'OBSERVATION_POI_VERIFY') {
      return {
        evidenceKind: 'poi_operator',
        evidenceWeight: 0.85,
        poiOpen: false,
        routeSegmentInfeasible: true,
        affectedPoiIds: [action.poiId],
        summary: 'POI operator confirms closure due to weather.',
      };
    }
    return { evidenceKind: 'stub', evidenceWeight: 0, summary: 'noop' };
  }
}
