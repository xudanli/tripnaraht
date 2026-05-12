import type { FeasibilityAdjustmentCode, IcelandRouteFeasibilitySegment } from '../iceland-world-driving-contracts';
import { GRAVEL_PROTECTION_INSURANCE_CODE } from '../iceland-world-driving-contracts';
import { normalizeFeasibilityRegion } from './iceland-feasibility-regions.util';

export interface GravelRoadSurfaceAlertsEvaluation {
  triggered: boolean;
  drivingNotes: string[];
  recommendedAdjustments: FeasibilityAdjustmentCode[];
  affectedSegments: string[];
}

/**
 * 任一路段 `surface === 'gravel'` 时触发：租车碎石/玻璃条款与 GP 类承保提醒（启发式，非保单解读）。
 */
export function evaluateGravelRoadSurfaceAlerts(segments: IcelandRouteFeasibilitySegment[]): GravelRoadSurfaceAlertsEvaluation {
  const affectedSegments: string[] = [];
  for (const s of segments) {
    if (s.surface !== 'gravel') continue;
    const a = normalizeFeasibilityRegion(s.from_region);
    const b = normalizeFeasibilityRegion(s.to_region);
    if (a && b) affectedSegments.push(`${a}-${b}`);
  }
  if (affectedSegments.length === 0) {
    return { triggered: false, drivingNotes: [], recommendedAdjustments: [], affectedSegments: [] };
  }
  return {
    triggered: true,
    drivingNotes: [
      'Gravel / unsealed segments increase windshield pitting and underbody damage risk: read the rental contract for exclusions on gravel roads; consider Gravel Protection (GP) / SAAP-style add-ons where the supplier offers them.',
      'Increase following distance, avoid close overtakes on loose stone, and expect reduced grip on shoulders after rain or frost.',
      'Campervans: spray and side-wind yaw are amplified on gravel — keep speed conservative and plan photo stops off the travel lane.',
    ],
    recommendedAdjustments: [GRAVEL_PROTECTION_INSURANCE_CODE],
    affectedSegments,
  };
}
