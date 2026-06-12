import type { RouteDirectionHealth } from '../interfaces/route-direction-health.interface';
import { calculateRouteDirectionHealthScore } from '../interfaces/route-direction-health.interface';
import type { RouteDirectionDecisionMemory } from '../interfaces/route-direction-decision-memory.interface';
import type { TripTaskMemory } from '../../context-engine/interfaces/trip-task-memory.interface';
import type { RouteAndRunRequestDto } from '../../dto/route-and-run.dto';

/** L3 路线健康运行时快照（装配层冻结，Injector / Replay 只读） */
export type ActiveRouteHealthSnapshot = Readonly<{
  routeDirectionId: number;
  countryCode: string;
  successRate: number;
  healthScore: number;
  totalRuns: number;
  successRuns: number;
  failureRuns: number;
  commonFailureReasons: readonly string[];
  commonRepairs: readonly string[];
  loadedAt: string;
}>;

export const L3_FAILURE_PATTERN_CAP = 5;
export const L3_ROUTE_HEALTH_LOOKUP_CAP = 8;

export function routeHealthSnapshotKey(routeDirectionId: number, countryCode: string): string {
  return `${routeDirectionId}_${countryCode.trim().toUpperCase()}`;
}

export function normalizeFailureReasonToken(reason: string): string {
  return reason
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_.-]/g, '');
}

/**
 * 确定性 failure pattern token：`${reason}:${count}`。
 * 当前 DB 仅存去重原因列表，计数暂为 1；未来 schema 升级后可填入真实 occurrence。
 */
export function buildFailurePatternsFromRouteHealth(
  health: Pick<RouteDirectionHealth, 'commonFailureReasons'>,
  cap = L3_FAILURE_PATTERN_CAP,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of health.commonFailureReasons ?? []) {
    const token = normalizeFailureReasonToken(String(raw));
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(`${token}:1`);
    if (out.length >= cap) break;
  }
  return out;
}

export function buildActiveRouteHealthSnapshot(
  health: RouteDirectionHealth,
  loadedAt: string,
): ActiveRouteHealthSnapshot {
  const successRate = health.totalRuns > 0 ? health.successRuns / health.totalRuns : 0.5;
  return {
    routeDirectionId: health.routeDirectionId,
    countryCode: health.countryCode.trim().toUpperCase(),
    successRate,
    healthScore: calculateRouteDirectionHealthScore(health),
    totalRuns: health.totalRuns,
    successRuns: health.successRuns,
    failureRuns: health.failureRuns,
    commonFailureReasons: [...(health.commonFailureReasons ?? [])],
    commonRepairs: [...(health.commonRepairs ?? [])],
    loadedAt,
  };
}

export function parseRouteDirectionId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number.parseInt(value.trim(), 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function resolveCountryCodeForL3Lookup(input: {
  request?: Pick<RouteAndRunRequestDto, 'structured_travel_input'>;
  travelPreference?: Record<string, unknown> | null;
  recentDecisions?: readonly RouteDirectionDecisionMemory[];
}): string | null {
  const structured = input.request?.structured_travel_input as Record<string, unknown> | undefined;
  const fromStructured =
    typeof structured?.destination_country === 'string'
      ? structured.destination_country
      : typeof structured?.countryCode === 'string'
        ? structured.countryCode
        : null;
  if (fromStructured?.trim()) return fromStructured.trim().toUpperCase();

  if (typeof structured?.destination === 'string' && structured.destination.trim()) {
    const dest = structured.destination.trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(dest)) return dest;
  }

  const tp = input.travelPreference;
  if (typeof tp?.countryCode === 'string' && tp.countryCode.trim()) {
    return tp.countryCode.trim().toUpperCase();
  }
  if (typeof tp?.destinationCountry === 'string' && tp.destinationCountry.trim()) {
    return tp.destinationCountry.trim().toUpperCase();
  }

  const latest = input.recentDecisions?.[0];
  if (latest?.countryCode?.trim()) {
    return latest.countryCode.trim().toUpperCase();
  }

  return null;
}

export type L3LookupCandidate = Readonly<{ routeDirectionId: number; countryCode: string }>;

export function collectL3LookupCandidates(input: {
  activeTripState?: TripTaskMemory | null;
  recentDecisions?: readonly RouteDirectionDecisionMemory[];
  defaultCountryCode?: string | null;
}): L3LookupCandidate[] {
  const seen = new Set<string>();
  const out: L3LookupCandidate[] = [];
  const push = (routeDirectionId: number, countryCode: string) => {
    const cc = countryCode.trim().toUpperCase();
    if (!cc) return;
    const key = routeHealthSnapshotKey(routeDirectionId, cc);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ routeDirectionId, countryCode: cc });
  };

  const activeId = parseRouteDirectionId(input.activeTripState?.selectedRouteDirectionId);
  const defaultCc = input.defaultCountryCode?.trim().toUpperCase() ?? null;
  if (activeId != null && defaultCc) {
    push(activeId, defaultCc);
  }

  for (const d of input.recentDecisions ?? []) {
    if (out.length >= L3_ROUTE_HEALTH_LOOKUP_CAP) break;
    push(d.selectedRouteDirectionId, d.countryCode);
  }

  return out.slice(0, L3_ROUTE_HEALTH_LOOKUP_CAP);
}

function coerceFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v)).filter((s) => s.length > 0);
}

/**
 * Redis JSON 反序列化后还原单条 L3 快照（数字/数组类型降级防护）。
 */
export function hydrateActiveRouteHealthSnapshot(raw: unknown): ActiveRouteHealthSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const routeDirectionId = parseRouteDirectionId(o.routeDirectionId);
  if (routeDirectionId == null) return null;

  const countryCode =
    typeof o.countryCode === 'string' && o.countryCode.trim()
      ? o.countryCode.trim().toUpperCase()
      : '';
  if (!countryCode) return null;

  const totalRuns = coerceFiniteNumber(o.totalRuns, 0);
  const successRuns = coerceFiniteNumber(o.successRuns, 0);
  const failureRuns = coerceFiniteNumber(o.failureRuns, 0);
  const commonFailureReasons = coerceStringArray(o.commonFailureReasons);
  const commonRepairs = coerceStringArray(o.commonRepairs);
  const successRate = coerceFiniteNumber(
    o.successRate,
    totalRuns > 0 ? successRuns / totalRuns : 0.5,
  );

  let healthScore = coerceFiniteNumber(o.healthScore, Number.NaN);
  if (!Number.isFinite(healthScore)) {
    healthScore = calculateRouteDirectionHealthScore({
      routeDirectionId,
      countryCode,
      totalRuns,
      successRuns,
      failureRuns,
      commonFailureReasons,
      commonRepairs,
      lastUpdated: new Date(),
    });
  }

  const loadedAt =
    typeof o.loadedAt === 'string' && o.loadedAt.trim()
      ? o.loadedAt
      : new Date().toISOString();

  return {
    routeDirectionId,
    countryCode,
    successRate,
    healthScore,
    totalRuns,
    successRuns,
    failureRuns,
    commonFailureReasons,
    commonRepairs,
    loadedAt,
  };
}

/**
 * 还原 routeHealthByKey 索引表；键规范化为 `${routeDirectionId}_${countryCode}`。
 */
export function hydrateRouteHealthByKey(raw: unknown): Record<string, ActiveRouteHealthSnapshot> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, ActiveRouteHealthSnapshot> = {};
  for (const value of Object.values(raw as Record<string, unknown>)) {
    const snap = hydrateActiveRouteHealthSnapshot(value);
    if (!snap) continue;
    out[routeHealthSnapshotKey(snap.routeDirectionId, snap.countryCode)] = snap;
  }
  return out;
}

export function resolveRouteHealthFromContext(
  ctx:
    | {
        routeHealthByKey?: Record<string, ActiveRouteHealthSnapshot>;
        activeRouteHealthSnapshot?: ActiveRouteHealthSnapshot | null;
      }
    | null
    | undefined,
  routeDirectionId: number,
  countryCode: string,
): ActiveRouteHealthSnapshot | null {
  if (!ctx) return null;
  const key = routeHealthSnapshotKey(routeDirectionId, countryCode);
  if (ctx.routeHealthByKey?.[key]) {
    return ctx.routeHealthByKey[key];
  }
  const active = ctx.activeRouteHealthSnapshot;
  if (
    active &&
    active.routeDirectionId === routeDirectionId &&
    active.countryCode === countryCode.trim().toUpperCase()
  ) {
    return active;
  }
  return null;
}
