import type { RoadStatus } from '../services/road-status-realtime.service';
import type { FRoadInfraStatus, FRoadStatus } from '../iceland-world-driving-contracts';

/**
 * Curated F-roads where unbridged / ford river crossings are commonly discussed in ops guidance.
 * Not exhaustive — extend from Vegagerðin highland tables + SafeTravel evidence.
 */
export const ICELAND_F_ROAD_RIVER_FORD_HEURISTIC = new Set(
  ['F249', 'F208', 'F910', 'F235', 'F88', 'F752', 'F821', 'F225'].map((s) => s.toUpperCase()),
);

function normalizeRoadId(id: string): string {
  const m = String(id || '').trim().match(/^(F\d{1,4})$/i);
  return m ? m[1].toUpperCase() : String(id || '').toUpperCase();
}

function inferStatus(rs: RoadStatus): FRoadInfraStatus {
  const msg = (rs.statusMessage || '').toLowerCase();
  const surf = (rs.conditions?.surface || '').toLowerCase();
  if (rs.currentStatus === 'closed') return 'closed';
  if (rs.currentStatus === 'unknown') return 'impassable';
  if (msg.includes('impassable') || msg.includes('not passable')) return 'impassable';
  if (surf.includes('snow') || surf.includes('ice') || msg.includes('snow') || msg.includes('icy')) {
    return 'snow_covered';
  }
  if (rs.currentStatus === 'limited') {
    if (surf.includes('snow') || surf.includes('ice') || msg.includes('snow')) return 'snow_covered';
    return 'open';
  }
  return 'open';
}

function inferRequires4x4(rs: RoadStatus): boolean {
  if (rs.currentStatus === 'limited') return true;
  const msg = rs.statusMessage || '';
  return /4x4|4wd|awd|high clearance|four[- ]wheel/i.test(msg);
}

function inferRiverCrossing(roadId: string): boolean {
  return ICELAND_F_ROAD_RIVER_FORD_HEURISTIC.has(normalizeRoadId(roadId));
}

function inferCamperRestricted(rs: RoadStatus, roadId: string): boolean {
  if (inferRiverCrossing(roadId)) return true;
  if (inferRequires4x4(rs)) return true;
  const msg = (rs.statusMessage || '').toLowerCase();
  return /camper|motorhome|caravan|large vehicle/i.test(msg);
}

export function mapRoadStatusToFRoadStatus(rs: RoadStatus): FRoadStatus {
  const roadId = normalizeRoadId(rs.roadId);
  const status = inferStatus(rs);
  const requires4x4 = inferRequires4x4(rs);
  const riverCrossing = inferRiverCrossing(roadId);
  const camperRestricted = inferCamperRestricted(rs, roadId);
  const baseConf =
    typeof rs.confidence === 'number' ? rs.confidence : rs.seasonalFallback ? 0.55 : 0.85;
  const conf =
    status === 'impassable' && rs.currentStatus === 'unknown' ? Math.min(baseConf, 0.45) : baseConf;

  return {
    roadId,
    status,
    requires4x4,
    riverCrossing,
    camperRestricted,
    confidence: conf,
  };
}
