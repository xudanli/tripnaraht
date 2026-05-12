/**
 * RESEARCH 阶段：行程起终点「上下文回填」与 transport.search 前置规范化。
 * VERIFY / REPAIR 内对 transport.search 的调用目前均为 itinerary 内嵌坐标对象，与本工具职责分离；
 * 若未来在 Verify/Repair 增加字符串型端点，应复用本模块以保持确定性校验一致。
 */

import type { DecisionState, StateHistoryDelta } from '../../../decision/kernel/decision-state.types';
import type { PhaseExecutorContext } from '../../../decision/kernel/interfaces/phase-executor.interface';
import {
  isTransportGeographicPlaceholder,
  isUnresolvedDestinationPlaceholder,
} from '../../utils/clarification-question-generator.util';
import { tryParseLatLngPairFromString } from '../../../skills/transport/transport-search.skill';
import { ContextRetriever } from './context-retriever.util';

/** 非 undefined 的行程切片（`tripPlanRequest?` 整体含 undefined，需剥离后再写字段） */
export type TripPlanTransportSlice = NonNullable<PhaseExecutorContext['tripPlanRequest']>;

export type TransportEndpointProvenance = 'userIntent' | 'dso_history' | 'conversation';

export interface HydrateTransportOptions {
  /** 与 RouteAndRun `conversation_context.recent_messages` 对齐，逆序扫描中的坐标子串 */
  recentMessages?: string[];
}

export interface TransportEndpointHydrationResult {
  trip: TripPlanTransportSlice | undefined;
  patchedFields: Array<'origin' | 'destination'>;
  /** 各端点事实来源（MV-DO 可追溯） */
  provenance?: Partial<Record<'origin' | 'destination', TransportEndpointProvenance>>;
  /** 非当前 trip_plan 直填、由 history 或对话回溯得到的端点 */
  derived_from_history?: Array<'origin' | 'destination'>;
  /** 轻量地理一致性提示（Saga / 澄清入口，不阻断 RESEARCH） */
  geo_context_hint?: 'possible_region_mismatch';
  /** 与 derived_from_history 同现：事实签名版本，供下游 DNA / 审计 */
  fact_signature?: 'mv_do_transport_endpoint_v1';
}

function isFiniteCoordPair(v: unknown): v is { lat: number; lng: number } {
  if (!v || typeof v !== 'object') return false;
  const lat = (v as { lat?: unknown }).lat;
  const lng = (v as { lng?: unknown }).lng;
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng);
}

/**
 * 将回填得到的字符串规范为坐标对象（若能解析出 lat,lng 子串），否则返回原字符串或 undefined。
 * 与 transport.search 内 `tryParseLatLngPairFromString` 对齐，避免把非坐标字符串误当下游锚点。
 */
export function normalizeHydratedTransportEndpoint(
  raw: unknown,
  role: 'origin' | 'destination',
): string | { lat: number; lng: number } | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (isFiniteCoordPair(raw)) return { lat: raw.lat, lng: raw.lng };
  if (typeof raw !== 'string') return undefined;
  const t = raw.trim();
  if (!t) return undefined;
  if (isTransportGeographicPlaceholder(t)) return undefined;
  if (role === 'destination' && isUnresolvedDestinationPlaceholder(t)) return undefined;
  const coords = tryParseLatLngPairFromString(t);
  if (coords) return coords;
  return t;
}

function deepFindEndpointField(slot: unknown, role: 'origin' | 'destination'): unknown {
  if (!slot || typeof slot !== 'object') return undefined;
  const o = slot as Record<string, unknown>;
  const direct = role === 'origin' ? o.origin : o.destination;
  if (direct !== undefined && direct !== null) return direct;
  const ui = o.userIntent;
  if (ui && typeof ui === 'object') {
    const u = ui as Record<string, unknown>;
    const v = role === 'origin' ? u.origin : u.destination;
    if (v !== undefined && v !== null) return v;
  }
  const patch = o.patch;
  if (patch && typeof patch === 'object') {
    const p = patch as Record<string, unknown>;
    const ui2 = p.userIntent;
    if (ui2 && typeof ui2 === 'object') {
      const u2 = ui2 as Record<string, unknown>;
      const v2 = role === 'origin' ? u2.origin : u2.destination;
      if (v2 !== undefined && v2 !== null) return v2;
    }
  }
  return undefined;
}

/**
 * 按 history 数组末尾为「最近」的约定，从新到旧扫描 `next` / `payload` / `prev`，
 * 提取曾提交过的 origin/destination（支持未来在 delta 中写入结构化快照）。
 */
export function resolveGeographicEndpointFromHistory(
  dso: DecisionState,
  role: 'origin' | 'destination',
): string | { lat: number; lng: number } | undefined {
  const hist = dso.history;
  if (!Array.isArray(hist) || hist.length === 0) return undefined;
  for (let i = hist.length - 1; i >= 0; i--) {
    const delta = hist[i] as StateHistoryDelta & { next?: unknown; prev?: unknown; payload?: unknown };
    for (const key of ['next', 'payload', 'prev'] as const) {
      const slot = delta[key];
      const raw = deepFindEndpointField(slot, role);
      const norm = normalizeHydratedTransportEndpoint(raw, role);
      if (norm !== undefined) return norm;
    }
  }
  return undefined;
}

/** 端点是否缺失、为空、或未解析的指代词（需回填或不可调用 transport） */
export function fieldNeedsTransportHydrationOrIsInvalid(
  value: string | { lat: number; lng: number } | undefined,
  role: 'origin' | 'destination',
): boolean {
  if (value === undefined || value === null) return true;
  if (isFiniteCoordPair(value)) return false;
  if (typeof value === 'object') return true;
  const s = String(value).trim();
  if (!s) return true;
  if (isTransportGeographicPlaceholder(s)) return true;
  if (role === 'destination' && isUnresolvedDestinationPlaceholder(s)) return true;
  return false;
}

/** 目的地语义指向冰岛/冰岛行程，但 origin 坐标落在中国东部近海一带时的粗粒度不一致提示 */
export function estimatePossibleRegionMismatch(trip: TripPlanTransportSlice): 'possible_region_mismatch' | undefined {
  const dest = trip.destination;
  const destStr = typeof dest === 'string' ? dest.toLowerCase() : '';
  const ice = /\biceland\b|ísland|\bisl\b|冰岛|冰島/.test(destStr);
  if (!ice) return undefined;
  const o = trip.origin;
  if (!isFiniteCoordPair(o)) return undefined;
  const { lat, lng } = o;
  if (lat > 18 && lat < 42 && lng > 100 && lng < 125) return 'possible_region_mismatch';
  return undefined;
}

function applyRoleHydration(
  out: TripPlanTransportSlice,
  role: 'origin' | 'destination',
  resolved: string | { lat: number; lng: number } | undefined,
  patchedFields: Array<'origin' | 'destination'>,
  provenance: Partial<Record<'origin' | 'destination', TransportEndpointProvenance>>,
  source: TransportEndpointProvenance,
): void {
  if (resolved === undefined) return;
  if (role === 'origin') out.origin = resolved;
  else out.destination = resolved;
  patchedFields.push(role);
  provenance[role] = source;
}

/**
 * 当 trip_plan 中某端点为指代词或空时，依次用 DSO.userIntent → history 逆序 → 对话逆序坐标抽取。
 */
export function hydrateTripPlanTransportEndpoints(
  dso: DecisionState,
  trip: TripPlanTransportSlice | undefined,
  opts?: HydrateTransportOptions,
): TransportEndpointHydrationResult {
  const patchedFields: Array<'origin' | 'destination'> = [];
  const provenance: Partial<Record<'origin' | 'destination', TransportEndpointProvenance>> = {};
  if (!trip) return { trip: undefined, patchedFields };

  const intent = dso.userIntent ?? {};
  const out: TripPlanTransportSlice = { ...trip };

  const tryHydrateRole = (role: 'origin' | 'destination') => {
    const cur = role === 'origin' ? out.origin : out.destination;
    if (!fieldNeedsTransportHydrationOrIsInvalid(cur as any, role)) return;

    const rawIntent = role === 'origin' ? intent.origin : intent.destination;
    let resolved = normalizeHydratedTransportEndpoint(rawIntent, role);
    let source: TransportEndpointProvenance | undefined;
    if (resolved !== undefined) source = 'userIntent';

    if (resolved === undefined) {
      resolved = resolveGeographicEndpointFromHistory(dso, role);
      if (resolved !== undefined) source = 'dso_history';
    }
    if (resolved === undefined && opts?.recentMessages?.length) {
      const fromConv = ContextRetriever.findLastResolvedCoordinateFromMessages(opts.recentMessages, role);
      if (fromConv !== undefined) {
        resolved = fromConv;
        source = 'conversation';
      }
    }

    if (resolved !== undefined && source) {
      applyRoleHydration(out, role, resolved, patchedFields, provenance, source);
    }
  };

  tryHydrateRole('origin');
  tryHydrateRole('destination');

  const derived_from_history = (['origin', 'destination'] as const).filter(
    (f) => provenance[f] && provenance[f] !== 'userIntent',
  ) as Array<'origin' | 'destination'>;

  const geo_context_hint = estimatePossibleRegionMismatch(out);

  const base: TransportEndpointHydrationResult = { trip: out, patchedFields, provenance };
  if (derived_from_history.length) {
    base.derived_from_history = derived_from_history;
    base.fact_signature = 'mv_do_transport_endpoint_v1';
  }
  if (geo_context_hint) base.geo_context_hint = geo_context_hint;
  return base;
}

function coerceEndpointForSkill(
  v: string | { lat: number; lng: number },
): string | { lat: number; lng: number } {
  if (typeof v === 'object' && v !== null && isFiniteCoordPair(v)) return v;
  if (typeof v === 'string') {
    const p = tryParseLatLngPairFromString(v);
    if (p) return p;
  }
  return v;
}

/** 是否具备调用 transport.search 的两端（允许地名字符串或坐标对象；lat,lng 字符串会归一为对象） */
export function normalizeTransportEndpointsForSkill(trip: TripPlanTransportSlice | undefined): {
  origin: string | { lat: number; lng: number };
  destination: string | { lat: number; lng: number };
} | undefined {
  if (!trip) return undefined;
  const o = trip.origin;
  const d = trip.destination;
  if (fieldNeedsTransportHydrationOrIsInvalid(o as any, 'origin')) return undefined;
  if (fieldNeedsTransportHydrationOrIsInvalid(d as any, 'destination')) return undefined;
  return {
    origin: coerceEndpointForSkill(o as string | { lat: number; lng: number }),
    destination: coerceEndpointForSkill(d as string | { lat: number; lng: number }),
  };
}
