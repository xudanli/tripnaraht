import type { TripObservationAction } from '../../../trips/road/trip-action.types';
import type { DecisionState } from '../decision-state.types';
import type { ObservationExecutionResult, ObservationToolExecutor } from './observation-harness.types';

/**
 * 默认执行器：不调用外网；弱证据占位，避免生产在无密钥时误伤计划。
 */
export class DefaultObservationToolExecutor implements ObservationToolExecutor {
  async execute(action: TripObservationAction, _dso: DecisionState): Promise<ObservationExecutionResult> {
    if (action.type === 'OBSERVATION_SNS_CRAWL') {
      return {
        evidenceKind: 'station_forecast',
        evidenceWeight: 0.35,
        passability01: 0.58,
        summary: 'Default stub: macro forecast only (no API keys).',
      };
    }
    return {
      evidenceKind: 'poi_operator',
      evidenceWeight: 0.45,
      poiOpen: true,
      summary: 'Default stub: POI assumed reachable pending real verify.',
    };
  }
}

/**
 * 高天气风险 + 特种线路 E2E：模拟「一小时前实拍」强证据与封路结论。
 */
export class SenjaStormObservationExecutor implements ObservationToolExecutor {
  constructor(private readonly riskPoiIds: string[]) {}

  async execute(action: TripObservationAction, dso: DecisionState): Promise<ObservationExecutionResult> {
    const targets = this.riskPoiIds.length
      ? this.riskPoiIds
      : (dso.userIntent?.mustIncludePoiIds ?? ['high-alpine-risk-poi']);

    if (action.type === 'OBSERVATION_SNS_CRAWL') {
      return {
        evidenceKind: 'recent_social_image',
        evidenceWeight: 0.9,
        passability01: 0.2,
        routeSegmentInfeasible: true,
        affectedPoiIds: targets,
        summary: 'SNS imagery (simulated): heavy snow; corridor impassable.',
      };
    }
    if (action.type === 'OBSERVATION_POI_VERIFY') {
      const hit = targets.includes(action.poiId);
      return {
        evidenceKind: 'poi_operator',
        evidenceWeight: 0.85,
        poiOpen: !hit,
        routeSegmentInfeasible: hit,
        affectedPoiIds: hit ? [action.poiId] : [],
        summary: hit ? 'Operator confirms closure risk for this POI.' : 'POI reachable.',
      };
    }
    return { evidenceKind: 'stub', evidenceWeight: 0, summary: 'noop' };
  }
}
