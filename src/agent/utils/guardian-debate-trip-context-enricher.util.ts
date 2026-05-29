// src/agent/utils/guardian-debate-trip-context-enricher.util.ts
import { DateTime } from 'luxon';
import { approximateCivilTwilightLocal } from '../../trips/decision/temporal/approximate-civil-twilight';
import type {
  EnturFerrySnapshot,
  GuardianDebateFerryStatusEntry,
  GuardianDebateRoadStatusEntry,
  GuardianDebateTripContextSku,
  OrchestratorState,
  TripPlanRequest,
} from '../interfaces/trip-plan.interface';
import { extractGuardianDebateUserIntentAnchors } from './guardian-debate-user-intent-anchor.util';

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

/**
 * 从 `ontology_hard_anchor.road_status_by_node` 转录为辩论 SKU 的 `environment.road_status`。
 */
function ontologyRoadStatusToSku(rd: Record<string, unknown>): GuardianDebateRoadStatusEntry[] | undefined {
  const onto = asRecord(rd.ontology_hard_anchor);
  const byNode = onto ? asRecord(onto.road_status_by_node) : undefined;
  if (!byNode) return undefined;
  const out: GuardianDebateRoadStatusEntry[] = [];
  for (const [nodeId, raw] of Object.entries(byNode)) {
    const nodePayload = asRecord(raw);
    if (!nodePayload) continue;
    const segs = nodePayload.segments;
    if (Array.isArray(segs) && segs.length > 0) {
      for (const s of segs) {
        const seg = asRecord(s);
        if (!seg) continue;
        const id =
          typeof seg.spatialSegmentId === 'string'
            ? seg.spatialSegmentId
            : typeof seg.roadQueryKey === 'string'
              ? seg.roadQueryKey
              : `${nodeId}:segment`;
        out.push({
          id,
          status: String(seg.accessState ?? nodePayload.aggregateAccessState ?? 'UNKNOWN'),
          reason: typeof seg.condition === 'string' ? seg.condition : undefined,
          source: typeof seg.source === 'string' ? seg.source : 'ontology_road_status',
        });
      }
    } else {
      out.push({
        id: nodeId,
        status: String(nodePayload.aggregateAccessState ?? 'UNKNOWN'),
        source: 'ontology_road_status',
      });
    }
  }
  return out.length ? out.slice(0, 24) : undefined;
}

function safetravelAlertsToRouteRefs(
  alerts: unknown[],
): Array<{ id?: string; title?: string; severity?: string }> {
  return alerts.slice(0, 8).map((a) => {
    const o = asRecord(a) ?? {};
    return {
      id: typeof o.id === 'string' ? o.id : undefined,
      title: typeof o.title === 'string' ? o.title : typeof o.headline === 'string' ? o.headline : undefined,
      severity: typeof o.severity === 'string' ? o.severity : undefined,
    };
  });
}

function collectSafetravelArrays(rd: Record<string, unknown>): unknown[] {
  const top = rd.safetravel_alerts;
  if (Array.isArray(top) && top.length) return top;
  const lrd = asRecord(rd.lightweight_research_data);
  const nested = lrd?.safetravel_alerts;
  return Array.isArray(nested) ? nested : [];
}

const ENTUR_STATUSES = new Set(['OPERATIONAL', 'CANCELLED', 'DELAYED', 'UNKNOWN']);

function normalizeEnturStatus(s: unknown): EnturFerrySnapshot['status'] {
  const x = String(s ?? 'UNKNOWN').toUpperCase();
  if (ENTUR_STATUSES.has(x)) return x as EnturFerrySnapshot['status'];
  return 'UNKNOWN';
}

/**
 * `research_data.transport_snapshots.entur[]` → `environment.ferry_status[]`（与 Prompt 中 SUSPENDED 等叙事对齐：CANCELLED → SUSPENDED）。
 */
function enturSnapshotsToFerrySku(rd: Record<string, unknown>): GuardianDebateFerryStatusEntry[] | undefined {
  const ts = asRecord(rd.transport_snapshots);
  const raw = ts?.entur;
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: GuardianDebateFerryStatusEntry[] = [];
  for (const item of raw.slice(0, 16)) {
    const o = asRecord(item);
    if (!o) continue;
    const serviceId = typeof o.service_id === 'string' ? o.service_id.trim() : '';
    if (!serviceId) continue;
    const snap: EnturFerrySnapshot = {
      service_id: serviceId,
      status: normalizeEnturStatus(o.status),
      next_departure: typeof o.next_departure === 'string' ? o.next_departure : undefined,
      disruptions: Array.isArray(o.disruptions)
        ? (o.disruptions as unknown[]).filter((x): x is string => typeof x === 'string')
        : undefined,
      source: 'Entur',
    };
    const reason = snap.disruptions?.length ? snap.disruptions.join('; ') : undefined;
    const statusForDebate =
      snap.status === 'CANCELLED' ? 'SUSPENDED' : snap.status === 'DELAYED' ? 'DELAYED' : snap.status;
    out.push({
      route: snap.service_id,
      status: statusForDebate,
      reason,
      next_available: snap.next_departure,
    });
  }
  return out.length ? out : undefined;
}

function extractTripDateYmd(trip: TripPlanRequest): string | null {
  const a = trip.start_date?.slice(0, 10);
  if (a && /^\d{4}-\d{2}-\d{2}$/.test(a)) return a;
  const b = trip.date_range?.start_date?.slice(0, 10);
  if (b && /^\d{4}-\d{2}-\d{2}$/.test(b)) return b;
  return null;
}

function extractDestinationLatLng(trip: TripPlanRequest): { lat: number; lng: number } | null {
  const d = trip.destination;
  if (d && typeof d === 'object' && typeof (d as { lat?: unknown }).lat === 'number' && typeof (d as { lng?: unknown }).lng === 'number') {
    const lat = (d as { lat: number }).lat;
    const lng = (d as { lng: number }).lng;
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return null;
}

/** 高纬 / 挪威峡湾与冰岛：用 IANA 区计算 civil dusk → UTC ISO，供 `scheduling_constraints.daylight_end`。 */
function inferIanaZoneForDaylight(trip: TripPlanRequest): string | null {
  const coords = extractDestinationLatLng(trip);
  if (coords) {
    const { lat, lng } = coords;
    if (lat >= 63 && lat <= 67 && lng >= -25 && lng <= -13) return 'Atlantic/Reykjavik';
    if (lat >= 55 && lat <= 72 && lng >= -10 && lng <= 35) return 'Europe/Oslo';
  }
  const s = typeof trip.destination === 'string' ? trip.destination : '';
  if (/norway|norge|geiranger|bergen|oslo|stavanger|ålesund|alesund|flåm|flam|lofoten|tromsø|tromso/i.test(s)) {
    return 'Europe/Oslo';
  }
  if (/iceland|reykjavik|ísland|\bvik\b/i.test(s)) return 'Atlantic/Reykjavik';
  return null;
}

function maybeEnrichDaylightEnd(
  trip: TripPlanRequest,
  manual?: GuardianDebateTripContextSku,
): GuardianDebateTripContextSku['scheduling_constraints'] | undefined {
  if (manual?.scheduling_constraints?.daylight_end) return undefined;
  const ymd = extractTripDateYmd(trip);
  const ll = extractDestinationLatLng(trip);
  const zone = inferIanaZoneForDaylight(trip);
  if (!ymd || !ll || !zone) return undefined;

  const noonLocal = DateTime.fromISO(`${ymd}T12:00:00`, { zone });
  if (!noonLocal.isValid) return undefined;
  const utcOffsetMinutes = noonLocal.offset;

  const tw = approximateCivilTwilightLocal(ymd, ll.lat, ll.lng, utcOffsetMinutes);
  if (!tw || tw.ambiguous) return undefined;

  const wall = DateTime.fromISO(`${ymd}T${tw.civilDusk}:00`, { zone });
  if (!wall.isValid) return undefined;

  return {
    daylight_end: wall.toUTC().toISO()!,
    daylight_end_source: 'suncalc_civil_dusk_v1',
  };
}

/**
 * 在 Gate 评估落定后，将本步已可见的 `research_data` 片段转录到 `trip_plan_request.guardian_debate_trip_context`，
 * 供辩论引擎 `trip_context` 与 `violations` 同源消费。显式请求体中的 SKU **优先**（合并时覆盖自动转录同名字段）。
 *
 * 约定：`research_data.transport_snapshots.entur` → `environment.ferry_status`；
 * 日光锚点：在具备目的地坐标 + 日期 + 可推断 IANA 区时，写入 `scheduling_constraints.daylight_end`（UTC ISO）。
 */
export function enrichGuardianDebateTripContextFromGateEval(state: OrchestratorState): void {
  const tpr = state.trip_plan_request;
  if (!tpr) return;
  const rd = asRecord(state.research_data);
  if (!rd) return;

  const manual = tpr.guardian_debate_trip_context;
  const auto: GuardianDebateTripContextSku = {};

  const roads = ontologyRoadStatusToSku(rd);
  const alerts = collectSafetravelArrays(rd);
  const routeRefs = alerts.length ? safetravelAlertsToRouteRefs(alerts) : undefined;
  const enturFerry = enturSnapshotsToFerrySku(rd);
  const daylight = maybeEnrichDaylightEnd(tpr, manual);
  const intentAnchors =
    manual?.user_intent_anchors ?? extractGuardianDebateUserIntentAnchors(tpr.message);

  if (roads?.length || routeRefs?.length || enturFerry?.length) {
    auto.environment = {};
    if (roads?.length) auto.environment.road_status = roads;
    if (routeRefs?.length) auto.environment.route_alert_refs = routeRefs;
    if (enturFerry?.length) auto.environment.ferry_status = enturFerry;
  }

  if (daylight) {
    auto.scheduling_constraints = { ...daylight };
  }

  const hasAutoEnv = Boolean(auto.environment && Object.keys(auto.environment).length > 0);
  const hasAutoSchedule = Boolean(auto.scheduling_constraints && Object.keys(auto.scheduling_constraints).length > 0);
  const hasManual = Boolean(manual);
  const hasIntent = Boolean(intentAnchors);
  if (!hasAutoEnv && !hasAutoSchedule && !hasManual && !hasIntent) return;

  tpr.guardian_debate_trip_context = {
    ...auto,
    ...(manual ?? {}),
    environment: { ...(auto.environment ?? {}), ...(manual?.environment ?? {}) },
    scheduling_constraints: {
      ...(auto.scheduling_constraints ?? {}),
      ...(manual?.scheduling_constraints ?? {}),
    },
    route_alternatives: manual?.route_alternatives ?? auto.route_alternatives,
    poi_metadata: manual?.poi_metadata ?? auto.poi_metadata,
    ...(intentAnchors ? { user_intent_anchors: intentAnchors } : {}),
  };
}
