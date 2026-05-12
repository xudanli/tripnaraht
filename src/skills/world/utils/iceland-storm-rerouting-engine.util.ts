/**
 * P2: rule-driven Plan B segment suggestions from a failed dual-audit verdict (no map API).
 * Uses preset region keys + heuristic distances from iceland-feasibility-regions.util.
 */

import type { CheckTripSafetyDualVerdictV1 } from '../iceland-check-trip-safety-dual-verdict.types';
import type { IcelandRouteFeasibilitySegment } from '../iceland-world-driving-contracts';
import { heuristicDistanceKm, normalizeFeasibilityRegion } from './iceland-feasibility-regions.util';

/** Heuristic “topology labels” for Agent / MCP (RING = A 类高地绕行). */
export type StormRerouteStrategy =
  | 'BYPASS_F_ROADS'
  | 'SPLIT_SEGMENTS'
  | 'ANCHOR_BASED_PLANNING'
  | 'RING_ROAD_CONTINUITY';

export interface IcelandStormRerouteCandidate {
  segments: IcelandRouteFeasibilitySegment[];
  primary_strategy: StormRerouteStrategy;
}

export interface IcelandStormReroutePlan {
  strategies_applied: StormRerouteStrategy[];
  candidates: IcelandStormRerouteCandidate[];
  notes: string[];
}

const F_BLOCK_CODES = new Set<string>([
  'VEHICLE_TYPE_INCOMPATIBLE',
  'ROAD_CLOSED',
  'ROAD_IMPASSABLE',
  'ROAD_SNOW_COVERED_2WD',
  'CAMPER_FR_RESTRICTED',
]);

/** A 类：Ring Road 实测级走廊（1 号公路；与 PAIR_KM 对齐，供 Plan B 重放） */
const RING_VIK_HOFN_KM = 272;
const RING_HOFN_EGILS_KM = 187;

function dedupeCandidates(candidates: IcelandStormRerouteCandidate[]): IcelandStormRerouteCandidate[] {
  const seen = new Set<string>();
  const out: IcelandStormRerouteCandidate[] = [];
  for (const c of candidates) {
    const k = JSON.stringify(c.segments);
    if (seen.has(k) || !c.segments.length) continue;
    seen.add(k);
    out.push(c);
    if (out.length >= 3) break;
  }
  return out;
}

function seg(a: string, b: string): IcelandRouteFeasibilitySegment {
  const km = heuristicDistanceKm(a, b);
  return km != null ? { from_region: a, to_region: b, distanceKm: km } : { from_region: a, to_region: b };
}

function ringEntryKey(fromKey: string): string {
  if (fromKey === 'highlands_center') return 'vik';
  return fromKey;
}

/**
 * 显式环岛南线 + 东峡湾门（多段替换单段高地/F 意图）。
 */
function planRingRoadContinuitySouthToEastfjords(fromKey: string, toKey: string): IcelandStormRerouteCandidate | null {
  const explicitFrom = fromKey;
  const from = ringEntryKey(fromKey);
  if (toKey !== 'egilsstadir' && toKey !== 'hofn') return null;

  const segs: IcelandRouteFeasibilitySegment[] = [];

  if (explicitFrom === 'highlands_center') {
    const exit = heuristicDistanceKm('highlands_center', 'vik');
    if (exit != null) {
      segs.push({ from_region: 'highlands_center', to_region: 'vik', distanceKm: exit });
    }
  }

  if (from === 'reykjavik' || from === 'keflavik') {
    const toVik = heuristicDistanceKm('reykjavik', 'vik');
    if (toVik == null) return null;
    segs.push({ from_region: 'reykjavik', to_region: 'vik', distanceKm: toVik });
  } else if (from !== 'vik' && from !== 'hofn') {
    const d = heuristicDistanceKm(from, 'vik');
    if (d == null) return null;
    segs.push({ from_region: from, to_region: 'vik', distanceKm: d });
  }

  if (toKey === 'hofn') {
    if (from === 'vik' || (segs.length && segs[segs.length - 1].to_region === 'vik')) {
      segs.push({ from_region: 'vik', to_region: 'hofn', distanceKm: RING_VIK_HOFN_KM });
    }
    return segs.length ? { segments: segs, primary_strategy: 'RING_ROAD_CONTINUITY' } : null;
  }

  const lastTo = segs.length ? segs[segs.length - 1].to_region : from === 'vik' ? 'vik' : null;
  const startHop =
    from === 'vik' || lastTo === 'vik'
      ? [{ from_region: 'vik', to_region: 'hofn', distanceKm: RING_VIK_HOFN_KM }]
      : [];
  if (!startHop.length && !segs.length) return null;
  segs.push(...startHop);
  segs.push({ from_region: 'hofn', to_region: 'egilsstadir', distanceKm: RING_HOFN_EGILS_KM });
  return { segments: segs, primary_strategy: 'RING_ROAD_CONTINUITY' };
}

/**
 * South / capital → east without F-roads（启发式 PAIR_KM，无显式环岛标时用）。
 */
function planBypassFRoadsHeuristic(fromKey: string, toKey: string): IcelandRouteFeasibilitySegment[] | null {
  const from = ringEntryKey(fromKey);
  const to = toKey;

  if (to !== 'egilsstadir' && to !== 'hofn' && to !== 'akureyri') {
    return null;
  }

  if (to === 'akureyri') {
    if (from === 'reykjavik' || from === 'keflavik') {
      return [seg('reykjavik', 'akureyri')];
    }
    if (from === 'vik' || from === 'hofn' || from === 'egilsstadir') {
      return [seg('vik', 'hofn'), seg('hofn', 'egilsstadir'), seg('egilsstadir', 'akureyri')];
    }
  }

  if (to === 'hofn') {
    if (from === 'vik') return [seg('vik', 'hofn')];
    if (from === 'reykjavik' || from === 'keflavik') {
      return [seg('reykjavik', 'hofn')];
    }
  }

  if (to === 'egilsstadir') {
    if (from === 'vik') return [seg('vik', 'hofn'), seg('hofn', 'egilsstadir')];
    if (from === 'reykjavik' || from === 'keflavik') {
      return [seg('reykjavik', 'hofn'), seg('hofn', 'egilsstadir')];
    }
    if (from === 'hofn') return [seg('hofn', 'egilsstadir')];
  }

  return null;
}

function planAnchorThenRing(fromKey: string, toKey: string): IcelandStormRerouteCandidate | null {
  const anchor = 'vik';
  if (fromKey === anchor) {
    const h = planBypassFRoadsHeuristic(fromKey, toKey);
    return h?.length ? { segments: h, primary_strategy: 'ANCHOR_BASED_PLANNING' } : null;
  }
  const toRing = heuristicDistanceKm(fromKey, anchor);
  if (toRing == null) {
    return null;
  }
  const first: IcelandRouteFeasibilitySegment = { from_region: fromKey, to_region: anchor, distanceKm: toRing };
  const rest = planBypassFRoadsHeuristic(anchor, toKey);
  if (!rest?.length) return { segments: [first], primary_strategy: 'ANCHOR_BASED_PLANNING' };
  return { segments: [first, ...rest], primary_strategy: 'ANCHOR_BASED_PLANNING' };
}

/** 极夜压缩：南→东且总里程长时，用 Höfn 作为过夜/拆段锚点（与能源种子 corridor 一致） */
function planPolarNightCompression(
  fromKey: string,
  toKey: string,
  totalKm: number,
): IcelandStormRerouteCandidate | null {
  if (totalKm <= 250) return null;
  if (toKey !== 'egilsstadir') return null;
  const ring = planRingRoadContinuitySouthToEastfjords(fromKey, toKey);
  if (!ring) return null;
  return { segments: ring.segments, primary_strategy: 'SPLIT_SEGMENTS' };
}

function splitLongLeg(original: IcelandRouteFeasibilitySegment[]): IcelandRouteFeasibilitySegment[] | null {
  let bestI = -1;
  let bestKm = 0;
  for (let i = 0; i < original.length; i++) {
    const km = original[i].distanceKm ?? 0;
    if (km > bestKm) {
      bestKm = km;
      bestI = i;
    }
  }
  if (bestI < 0 || bestKm < 180) return null;
  const s = original[bestI];
  const a = normalizeFeasibilityRegion(s.from_region);
  const b = normalizeFeasibilityRegion(s.to_region);
  if (!a || !b) return null;

  let mid = 'reykjavik';
  if ((a === 'vik' || a === 'highlands_center') && b === 'egilsstadir') {
    mid = 'hofn';
  } else if (a === 'vik' || b === 'egilsstadir') {
    mid = 'hofn';
  }
  const d1 = heuristicDistanceKm(a, mid);
  const d2 = heuristicDistanceKm(mid, b);
  if (d1 == null || d2 == null) return null;
  const out: IcelandRouteFeasibilitySegment[] = [...original.slice(0, bestI)];
  out.push({ from_region: a, to_region: mid, distanceKm: d1 });
  out.push({ from_region: mid, to_region: b, distanceKm: d2 });
  out.push(...original.slice(bestI + 1));
  return out;
}

/**
 * Heuristic Plan B from a failed dual verdict + original segment template.
 */
export function suggestAlternativePlans(
  failedVerdict: CheckTripSafetyDualVerdictV1,
  originalSegments: IcelandRouteFeasibilitySegment[],
): IcelandStormReroutePlan {
  const notes: string[] = [];
  const strategies: StormRerouteStrategy[] = [];
  const candidates: IcelandStormRerouteCandidate[] = [];

  if (!originalSegments?.length) {
    return {
      strategies_applied: [],
      candidates: [],
      notes: ['original_segments required to anchor reroute endpoints.'],
    };
  }

  const fromKey = normalizeFeasibilityRegion(originalSegments[0].from_region);
  const toKey = normalizeFeasibilityRegion(originalSegments[originalSegments.length - 1].to_region);
  if (!fromKey || !toKey) {
    return {
      strategies_applied: [],
      candidates: [],
      notes: ['Endpoints must resolve to preset atlas regions (see iceland-feasibility-regions aliases).'],
    };
  }

  const blocked = failedVerdict.physical_constraints.road_status.blocked_reasons;
  const fRoad = failedVerdict.physical_constraints.road_status.f_road_segments_declared;
  const regime = failedVerdict.physical_constraints.daylight.regime;
  const adjustments = failedVerdict.recommended_adjustments;
  const totalKm = failedVerdict.energy_logistics.metrics?.total_km ?? 0;
  const desert = failedVerdict.energy_logistics.safety_alerts.some(
    (a) => /supply desert|highlands/i.test(a),
  );
  const anchorStop = failedVerdict.energy_logistics.recommended_stops.find((s) => s.action === 'REFILL_BEFORE_HIGHLANDS');

  const wantsBypass =
    fRoad && blocked.some((b) => F_BLOCK_CODES.has(String(b)));

  if (wantsBypass) {
    strategies.push('BYPASS_F_ROADS');
    const ringCont = planRingRoadContinuitySouthToEastfjords(fromKey, toKey);
    if (ringCont) {
      strategies.push('RING_ROAD_CONTINUITY');
      candidates.push(ringCont);
      notes.push(
        'RING_ROAD_CONTINUITY: South Coast → Höfn → Egilsstaðir (Ring-1), explicit segment km for Plan B replay.',
      );
    } else {
      const ring = planBypassFRoadsHeuristic(fromKey, toKey);
      if (ring?.length) {
        candidates.push({ segments: ring, primary_strategy: 'BYPASS_F_ROADS' });
        notes.push('BYPASS_F_ROADS: Ring-1 style hops without F-road roadId; re-run check_trip_safety on each alternative.');
      } else {
        notes.push('BYPASS_F_ROADS: no canned ring pattern for this endpoint pair — extend PAIR_KM / rules.');
      }
    }
  }

  const wantsSplit =
    (regime === 'polar_night' || adjustments.includes('REDUCE_DAILY_MILEAGE') || adjustments.includes('NIGHT_DRIVING_REQUIRED')) &&
    totalKm > 200;

  if (wantsSplit) {
    strategies.push('SPLIT_SEGMENTS');
    if (regime === 'polar_night' && totalKm > 250) {
      const polar = planPolarNightCompression(fromKey, toKey, totalKm);
      if (polar) {
        candidates.push(polar);
        notes.push('SPLIT_SEGMENTS (polar_night): long south→east span → overnight / staging via Höfn or Vík corridor.');
      }
    }
    const spl = splitLongLeg(originalSegments);
    if (spl?.length) {
      candidates.push({ segments: spl, primary_strategy: 'SPLIT_SEGMENTS' });
      notes.push('SPLIT_SEGMENTS: inserted midpoint preset (Höfn for south→east) to shorten daylight-critical legs.');
    }
  }

  if (desert || anchorStop) {
    strategies.push('ANCHOR_BASED_PLANNING');
    const anchorPlan = planAnchorThenRing(fromKey, toKey);
    if (anchorPlan) {
      candidates.push(anchorPlan);
      notes.push(
        `ANCHOR_BASED_PLANNING: bias supply anchor (${anchorStop?.name ?? 'Vík corridor'}) before long / desert exposure.`,
      );
    }
  }

  if (!strategies.length) {
    notes.push('No heuristic matched; provide blocked F-road, polar-night overload, or supply-desert signals.');
  }

  return {
    strategies_applied: Array.from(new Set(strategies)),
    candidates: dedupeCandidates(candidates),
    notes,
  };
}
