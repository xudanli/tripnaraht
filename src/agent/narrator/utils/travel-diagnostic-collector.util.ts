/**
 * 行程诊断报告 — 从住宿锚距、漏订、门控等硬信号聚合（供 VoiceEvidenceTranslator 消费）。
 */

import type { Itinerary } from '../../interfaces/trip-plan.interface';
import { MAX_PLAUSIBLE_HOTEL_ANCHOR_KM } from '../../utils/hotel-mcp-route-run.mapper';

export type TravelSeasonHint = 'WINTER' | 'SUMMER' | 'SHOULDER' | 'UNKNOWN';

export interface StayDistanceIssue {
  nightIndex: number;
  distanceKm: number;
  anchorNameZh: string;
  hotelName?: string;
  /** 粗估驾车分钟（冰岛乡村路按 ~55 km/h） */
  drivingMinutesEstimate: number;
}

export interface TravelDiagnosticReport {
  hasGeoImpossibleConflict: boolean;
  geoImpossibleStays: StayDistanceIssue[];
  hasPacingConflict: boolean;
  pacingRiskStays: StayDistanceIssue[];
  missingAccommodationDays: number[];
  season: TravelSeasonHint;
  hasSelfHealApplied: boolean;
  totalDays: number;
  /** 任一需用户关注的硬问题 */
  hasMajorItineraryConflict: boolean;
}

const PACING_RISK_KM = 80;
const DRIVE_SPEED_KMH = 55;

function estimateDrivingMinutes(km: number): number {
  return Math.max(1, Math.round((km / DRIVE_SPEED_KMH) * 60));
}

function inferSeasonFromDate(dateYmd?: string): TravelSeasonHint {
  if (!dateYmd?.trim()) return 'UNKNOWN';
  const m = parseInt(dateYmd.slice(5, 7), 10);
  if (!Number.isFinite(m)) return 'UNKNOWN';
  if (m === 11 || m === 12 || m <= 2) return 'WINTER';
  if (m >= 6 && m <= 8) return 'SUMMER';
  return 'SHOULDER';
}

function pickStr(o: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

function cardDistanceKm(c: Record<string, unknown>): number | undefined {
  const d = c.distance_to_anchor_km ?? c.distanceKm;
  return typeof d === 'number' && Number.isFinite(d) ? d : undefined;
}

function extractCardsFromNightGroups(groups: unknown[] | null | undefined): Array<{
  nightIndex: number;
  card: Record<string, unknown>;
  hasSample: boolean;
}> {
  const out: Array<{ nightIndex: number; card: Record<string, unknown>; hasSample: boolean }> = [];
  if (!Array.isArray(groups)) return out;
  for (const raw of groups) {
    if (!raw || typeof raw !== 'object') continue;
    const g = raw as Record<string, unknown>;
    const night =
      typeof g.night_index === 'number'
        ? g.night_index
        : typeof g.nightIndex === 'number'
          ? g.nightIndex
          : undefined;
    if (night == null || !Number.isFinite(night)) continue;
    const hasSample = g.has_mcp_sample !== false;
    const cards = Array.isArray(g.cards) ? g.cards : [];
    const primary =
      cards.find((c) => c && typeof c === 'object') as Record<string, unknown> | undefined;
    if (primary) {
      out.push({ nightIndex: night, card: primary, hasSample });
    } else if (!hasSample) {
      out.push({ nightIndex: night, card: {}, hasSample: false });
    }
  }
  return out;
}

export function collectTravelDiagnostic(input: {
  itinerary?: Itinerary | null;
  accommodations?: unknown[] | null;
  accommodationNightGroups?: unknown[] | null;
  gateViolations?: Array<{ type?: string; severity?: string; detail?: string }> | null;
  selfHealApplied?: boolean;
}): TravelDiagnosticReport {
  const totalDays = input.itinerary?.days?.length ?? 0;
  const firstDate = input.itinerary?.days?.[0]?.date;
  const season = inferSeasonFromDate(firstDate);

  const geoImpossibleStays: StayDistanceIssue[] = [];
  const pacingRiskStays: StayDistanceIssue[] = [];
  const bookedNights = new Set<number>();

  const nightEntries = extractCardsFromNightGroups(input.accommodationNightGroups);
  if (!nightEntries.length && Array.isArray(input.accommodations)) {
    for (const raw of input.accommodations) {
      if (!raw || typeof raw !== 'object') continue;
      const c = raw as Record<string, unknown>;
      const night =
        typeof c.nightIndex === 'number'
          ? c.nightIndex
          : typeof c.night_index === 'number'
            ? c.night_index
            : undefined;
      if (night != null) nightEntries.push({ nightIndex: night, card: c, hasSample: true });
    }
  }

  for (const { nightIndex, card, hasSample } of nightEntries) {
    if (hasSample) bookedNights.add(nightIndex);
    const dist = cardDistanceKm(card);
    if (dist == null) continue;

    const anchor = pickStr(card, ['anchor_poi_name_zh', 'anchorPoiNameZh']) ?? '当日景点';
    const hotel = pickStr(card, ['name', 'nameCN']) ?? '所选住宿';
    const issue: StayDistanceIssue = {
      nightIndex,
      distanceKm: dist,
      anchorNameZh: anchor,
      hotelName: hotel,
      drivingMinutesEstimate: estimateDrivingMinutes(dist),
    };

    if (dist > MAX_PLAUSIBLE_HOTEL_ANCHOR_KM) {
      geoImpossibleStays.push(issue);
    } else if (dist > PACING_RISK_KM && (season === 'WINTER' || dist > 120)) {
      pacingRiskStays.push(issue);
    }
  }

  const missingAccommodationDays: number[] = [];
  if (totalDays > 0) {
    for (let i = 1; i <= totalDays; i++) {
      if (!bookedNights.has(i)) missingAccommodationDays.push(i);
    }
  }

  const gateGeoHint = (input.gateViolations ?? []).some(
    (v) =>
      /distance|anchor|住宿|hotel|km|定位/i.test(String(v.detail ?? '')) ||
      v.type === 'VEHICLE_SPACE_INSUFFICIENT',
  );

  const hasGeoImpossibleConflict = geoImpossibleStays.length > 0 || gateGeoHint;
  const hasPacingConflict = pacingRiskStays.length > 0;
  const hasMajorItineraryConflict =
    hasGeoImpossibleConflict ||
    hasPacingConflict ||
    missingAccommodationDays.length >= 2;

  return {
    hasGeoImpossibleConflict,
    geoImpossibleStays,
    hasPacingConflict,
    pacingRiskStays,
    missingAccommodationDays,
    season,
    hasSelfHealApplied: input.selfHealApplied === true,
    totalDays,
    hasMajorItineraryConflict,
  };
}
