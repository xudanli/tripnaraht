/**
 * Project POI authority tick materialization into DecisionTickWorldViews.
 */

import type {
  DecisionTickWorldViews,
  PoiOpenView,
} from './decision-world-consistency.types';
import type { DecisionTickPoiMaterialization } from '../../../trips/decision/world-consistency/poi-authority-bridge.types';

function toView(status: DecisionTickPoiMaterialization['poiStatus']): PoiOpenView {
  if (status === 'RESTRICTED') return 'UNKNOWN';
  return status;
}

export function projectPoiBridgeToTickViews(input: {
  materialization: DecisionTickPoiMaterialization;
  realityPoi: PoiOpenView;
}): DecisionTickWorldViews {
  const m = input.materialization;
  const poi = toView(m.poiStatus);
  const sv = m.sourceVersion;

  return {
    tickId: m.tickId,
    scenarioId: 'POI_CLOSED',
    group: 'SAFETY_EXTERNAL',
    reality: { poi: input.realityPoi },
    canonical: {
      poi,
      snapshotId: `ws_${m.tickId}`,
      poiSourceVersion: sv,
    },
    constraintStore: {},
    worldModelContext: { poi, poiSourceVersion: sv },
    gateSees: {
      poi,
      disposition: m.gateDisposition,
      snapshotId: `ws_${m.tickId}`,
      poiSourceVersion: sv,
    },
    abuSees: {},
    cgusSees: { windMps: null, windSource: 'absent' },
    neptuneSees: { poi },
  };
}
