import type { FeasibilityAdjustmentCode, IcelandRouteFeasibilitySegment } from '../iceland-world-driving-contracts';
import { VESTFJARDAR_TUNNEL_PROTOCOL_CODE } from '../iceland-world-driving-contracts';
import { normalizeFeasibilityRegion } from './iceland-feasibility-regions.util';

/** 触发 Vestfjarðagöng / 西峡湾单向隧道语义的路网预设端点 */
const WESTFJORDS_TUNNEL_MESH_PRESETS = new Set(['isafjordur', 'patreksfjordur', 'holmavik']);

export interface WestfjordsTunnelProtocolEvaluation {
  triggered: boolean;
  drivingNotes: string[];
  recommendedAdjustments: FeasibilityAdjustmentCode[];
  /** 预设端点键，形如 `holmavik-isafjordur`（与行程方向一致） */
  affectedSegments: string[];
}

/**
 * 轻量启发式：路段触及西峡湾核心/南翼/门户预设时，提示单向隧道会让行（非路况 API、非封闭裁决）。
 */
export function evaluateWestfjordsTunnelProtocol(segments: IcelandRouteFeasibilitySegment[]): WestfjordsTunnelProtocolEvaluation {
  const touched = new Set<string>();
  const affectedSegments: string[] = [];

  for (const s of segments) {
    const a = normalizeFeasibilityRegion(s.from_region);
    const b = normalizeFeasibilityRegion(s.to_region);
    if (a && WESTFJORDS_TUNNEL_MESH_PRESETS.has(a)) touched.add(a);
    if (b && WESTFJORDS_TUNNEL_MESH_PRESETS.has(b)) touched.add(b);
    if (a && b && (WESTFJORDS_TUNNEL_MESH_PRESETS.has(a) || WESTFJORDS_TUNNEL_MESH_PRESETS.has(b))) {
      affectedSegments.push(`${a}-${b}`);
    }
  }

  if (touched.size === 0) {
    return { triggered: false, drivingNotes: [], recommendedAdjustments: [], affectedSegments: [] };
  }

  const code = VESTFJARDAR_TUNNEL_PROTOCOL_CODE;

  return {
    triggered: true,
    drivingNotes: [
      'Single-lane tunnels detected (Vestfjarðagöng and similar): give way to oncoming traffic; obey live signals/green arrows and any attendant instructions — signed priority may favor traffic heading towards Ísafjörður on some links.',
      'Use marked passing bays and M-stæði (M-turnouts) on your right; never treat the opposing lane as a “chicken” lane.',
      'Campervans / wide vehicles: expect slower merges and queues at tunnel mouths; pad the schedule beyond raw driving hours.',
    ],
    recommendedAdjustments: [code],
    affectedSegments,
  };
}
