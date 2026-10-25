/**
 * 现有 Evidence 结构 → System1Evidence adapter。不删除旧类型，只统一消费面。
 */

import { normalizeEvidenceFreshness, type EvidenceFactV1 } from '../harness/hardening/evidence.contract';
import type { LiveEvidenceFactV1 } from '../harness/live-execution-runtime.util';
import type { TripDayTimelineFactSlice } from '../harness/trip-day-timeline-fact.util';
import type { TripLodgingCoverageFactSlice } from '../harness/trip-lodging-coverage-fact.util';
import type { System1Evidence, System1EvidenceSourceType } from './system1-runtime.types';

function idFor(key: string, index: number, sourceRef?: string): string {
  const ref = sourceRef ? `:${sourceRef}` : '';
  return `s1ev:${key}:${index}${ref}`;
}

function sourceTypeFromHint(
  source?: string,
  fallback: System1EvidenceSourceType = 'TOOL',
): System1EvidenceSourceType {
  const s = String(source ?? '').toLowerCase();
  if (s.includes('user')) return 'USER_INPUT';
  if (s.includes('ontology')) return 'ONTOLOGY';
  if (s.includes('rag') || s.includes('knowledge')) return 'KNOWLEDGE';
  if (s.includes('memory')) return 'MEMORY';
  if (s.includes('trip') || s.includes('slice') || s.includes('plan')) return 'TRIP_STATE';
  if (s.includes('mcp') || s.includes('api')) return 'EXTERNAL_API';
  if (s.includes('road') || s.includes('weather') || s.includes('sensor')) return 'WORLD_STATE';
  return fallback;
}

function canonicalLiveKey(raw: string): string {
  const k = String(raw ?? '').trim();
  if (k === 'weather' || k === 'weather.forecast' || k === 'weather.wind') return 'weather.wind';
  if (k === 'road' || k === 'road_state' || k === 'road_aggregate' || k === 'route.status') {
    return 'route.status';
  }
  if (k === 'delay_hours' || k === 'trip.delay') return 'trip.delay';
  if (k === 'remaining_drive_hours' || k === 'route.eta') return 'route.eta';
  if (k === 'destination' || k === 'target.poi') return 'target.poi';
  if (k === 'location' || k === 'trip.current_location') return 'trip.current_location';
  if (k === 'vehicle' || k === 'vehicle.profile') return 'vehicle.profile';
  return k;
}

export function adaptEvidenceFactV1(facts: EvidenceFactV1[]): System1Evidence[] {
  return facts.map((f, i) => ({
    evidenceId: idFor(f.key, i, f.source),
    key: canonicalLiveKey(f.key),
    sourceType: sourceTypeFromHint(f.source),
    sourceRef: f.source,
    value: f.valueZh,
    status: normalizeEvidenceFreshness(f.freshness),
    observedAt: f.observedAt,
    provenance: f.source ? { provider: f.source } : undefined,
  }));
}

export function adaptLiveEvidenceFactV1(facts: LiveEvidenceFactV1[]): System1Evidence[] {
  return facts.map((f, i) => ({
    evidenceId: idFor(canonicalLiveKey(f.key), i, f.source),
    key: canonicalLiveKey(f.key),
    sourceType: sourceTypeFromHint(f.source, 'WORLD_STATE'),
    sourceRef: f.source,
    value: f.valueZh,
    status: normalizeEvidenceFreshness(f.freshness),
    provenance: f.source ? { provider: f.source } : undefined,
  }));
}

export function adaptLodgingCoverageSlice(
  slice: TripLodgingCoverageFactSlice | null | undefined,
): System1Evidence[] {
  if (!slice) {
    return [
      {
        evidenceId: 's1ev:trip.day_list:missing',
        key: 'trip.day_list',
        sourceType: 'TRIP_STATE',
        value: null,
        status: 'UNAVAILABLE',
      },
    ];
  }
  return [
    {
      evidenceId: `s1ev:trip.day_list:${slice.tripId}`,
      key: 'trip.day_list',
      sourceType: 'TRIP_STATE',
      sourceRef: slice.tripId,
      value: { dayCount: slice.dayCount, nightsExpected: slice.nightsExpected },
      status: slice.dayCount > 0 ? 'VERIFIED' : 'UNAVAILABLE',
    },
    {
      evidenceId: `s1ev:trip.accommodation_anchors:${slice.tripId}`,
      key: 'trip.accommodation_anchors',
      sourceType: 'TRIP_STATE',
      sourceRef: slice.tripId,
      value: {
        nightsCovered: slice.nightsCovered,
        missingDayNumbers: slice.missingDayNumbers,
      },
      status: slice.dayCount > 0 ? 'VERIFIED' : 'UNAVAILABLE',
    },
  ];
}

export function adaptDayTimelineSlice(
  slice: TripDayTimelineFactSlice | null | undefined,
  family: 'TRIP_QUERY_TODAY' | 'TRIP_QUERY_NEXT' | 'TRIP_QUERY_DAY' = 'TRIP_QUERY_TODAY',
): System1Evidence[] {
  if (!slice) {
    return [
      {
        evidenceId: 's1ev:trip.current_day:missing',
        key: 'trip.current_day',
        sourceType: 'TRIP_STATE',
        value: null,
        status: 'UNAVAILABLE',
      },
    ];
  }
  const current = slice.days.find((d) => d.dayNumber === slice.currentDayNumber);
  const out: System1Evidence[] = [
    {
      evidenceId: `s1ev:trip.current_day:${slice.tripId}`,
      key: 'trip.current_day',
      sourceType: 'TRIP_STATE',
      value: { dayNumber: slice.currentDayNumber, ymd: current?.ymd },
      status: current ? 'VERIFIED' : 'UNAVAILABLE',
    },
    {
      evidenceId: `s1ev:trip.timeline:${slice.tripId}`,
      key: 'trip.timeline',
      sourceType: 'TRIP_STATE',
      value: { itemCount: current?.items.length ?? 0 },
      status: current ? 'VERIFIED' : 'ASSUMED',
    },
  ];
  if (family === 'TRIP_QUERY_NEXT') {
    const next =
      current?.items?.[0] ??
      slice.days.find((d) => d.dayNumber === (slice.tomorrowDayNumber ?? slice.currentDayNumber + 1))
        ?.items?.[0];
    out.push({
      evidenceId: `s1ev:trip.next_activity:${slice.tripId}`,
      key: 'trip.next_activity',
      sourceType: 'TRIP_STATE',
      value: next ? { nameZh: next.nameZh } : null,
      status: next ? 'VERIFIED' : 'UNAVAILABLE',
    });
  }
  return out;
}

export function mergeSystem1Evidence(bags: System1Evidence[][]): System1Evidence[] {
  const out: System1Evidence[] = [];
  const seen = new Set<string>();
  for (const bag of bags) {
    for (const e of bag) {
      const k = `${e.key}::${e.evidenceId}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(e);
    }
  }
  return out;
}

export function adaptPlaceSearchHits(
  places: Array<{
    id?: string | number;
    nameCN?: string | null;
    nameEN?: string | null;
    category?: string | null;
    address?: string | null;
  }>,
): System1Evidence[] {
  return places.map((p, i) => {
    const idStr = p.id != null ? String(p.id) : undefined;
    const name = String(p.nameCN || p.nameEN || idStr || `place_${i}`);
    return {
      evidenceId: idFor('knowledge.hit', i, idStr),
      key: 'knowledge.hit',
      sourceType: 'TOOL' as const,
      sourceRef: idStr,
      value: { name, category: p.category, address: p.address },
      status: 'VERIFIED' as const,
      provenance: { provider: 'places.search', documentId: idStr },
    };
  });
}

export function adaptRagSnippets(
  snippets: Array<{ content: string; source?: string; score?: number }>,
): System1Evidence[] {
  return snippets
    .filter((s) => String(s.content ?? '').trim())
    .map((s, i) => ({
      evidenceId: idFor('knowledge.hit', i, s.source),
      key: 'knowledge.hit',
      sourceType: 'KNOWLEDGE' as const,
      sourceRef: s.source,
      value: s.content,
      status: 'VERIFIED' as const,
      confidence: s.score,
      provenance: { provider: 'rag', documentId: s.source },
    }));
}

export function adaptAssumedKnowledgeHit(text: string, provider: string): System1Evidence {
  return {
    evidenceId: `s1ev:knowledge.hit:assumed:${provider}`,
    key: 'knowledge.hit',
    sourceType: 'KNOWLEDGE',
    value: text,
    status: 'ASSUMED',
    provenance: { provider },
  };
}

export function adaptTravelDecisionProblem(input: {
  decisionId?: string;
  decisionKey?: string;
  options?: Array<{ optionId: string; label_zh?: string; feasibility?: string }>;
  recommendation?: { optionId: string; reason_zh?: string } | null;
  selection?: { optionId: string } | null;
}): System1Evidence[] {
  const options = input.options ?? [];
  const ready = options.filter((o) => o.feasibility !== 'BLOCKED');
  return [
    {
      evidenceId: `s1ev:decision.options:${input.decisionId ?? input.decisionKey ?? 'open'}`,
      key: 'decision.options',
      sourceType: 'TOOL',
      sourceRef: input.decisionId,
      value: {
        decisionKey: input.decisionKey,
        optionIds: options.map((o) => o.optionId),
        feasibleCount: ready.length,
        recommendedOptionId: input.recommendation?.optionId,
        selectedOptionId: input.selection?.optionId,
      },
      status: ready.length >= 2 ? 'VERIFIED' : 'UNAVAILABLE',
    },
  ];
}

export function adaptDecisionConstraints(input: {
  dayCount?: number | null;
  winterLikely?: boolean;
  vehicleHint?: string | null;
}): System1Evidence {
  const hasDay = typeof input.dayCount === 'number' && input.dayCount > 0;
  return {
    evidenceId: 's1ev:trip.constraints',
    key: 'trip.constraints',
    sourceType: hasDay ? 'TRIP_STATE' : 'USER_INPUT',
    value: {
      dayCount: input.dayCount ?? null,
      winterLikely: input.winterLikely === true,
      vehicleHint: input.vehicleHint ?? null,
    },
    status: hasDay ? 'VERIFIED' : 'UNAVAILABLE',
  };
}

export function adaptDayViewRead(input: {
  tripId?: string;
  dayNumber?: number | null;
  dateIso?: string | null;
  itemCount?: number;
  success: boolean;
}): System1Evidence[] {
  if (!input.success || input.dayNumber == null) {
    return [
      {
        evidenceId: 's1ev:trip.current_day:day_view_missing',
        key: 'trip.current_day',
        sourceType: 'TRIP_STATE',
        value: null,
        status: 'UNAVAILABLE',
      },
      {
        evidenceId: 's1ev:trip.timeline:day_view_missing',
        key: 'trip.timeline',
        sourceType: 'TRIP_STATE',
        value: null,
        status: 'UNAVAILABLE',
      },
    ];
  }
  return [
    {
      evidenceId: `s1ev:trip.current_day:${input.tripId ?? 'day_view'}:${input.dayNumber}`,
      key: 'trip.current_day',
      sourceType: 'TRIP_STATE',
      value: { dayNumber: input.dayNumber, ymd: input.dateIso ?? null },
      status: 'VERIFIED',
    },
    {
      evidenceId: `s1ev:trip.timeline:${input.tripId ?? 'day_view'}:${input.dayNumber}`,
      key: 'trip.timeline',
      sourceType: 'TRIP_STATE',
      value: { itemCount: input.itemCount ?? 0 },
      status: 'VERIFIED',
    },
  ];
}

export function adaptInventoryHit(input: {
  kind: 'hotel' | 'car_rental' | 'dining' | 'flight' | 'xhs' | 'activity' | string;
  hitCount: number;
  previewZh?: string | null;
  provider?: string;
}): System1Evidence {
  const kind = String(input.kind || 'inventory');
  if (!input.hitCount || input.hitCount <= 0) {
    return {
      evidenceId: `s1ev:inventory.hit:${kind}:unavailable`,
      key: 'inventory.hit',
      sourceType: 'TOOL',
      value: null,
      status: 'UNAVAILABLE',
      provenance: { provider: input.provider ?? kind },
    };
  }
  return {
    evidenceId: `s1ev:inventory.hit:${kind}:${input.hitCount}`,
    key: 'inventory.hit',
    sourceType: 'TOOL',
    value: {
      kind,
      hitCount: input.hitCount,
      previewZh: input.previewZh?.slice(0, 240) ?? null,
    },
    status: 'VERIFIED',
    provenance: { provider: input.provider ?? `mcp:${kind}` },
  };
}
