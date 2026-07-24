/**
 * 2.0 细粒度研究资产：按 Scope 局部无效化 + RESEARCH 局部重算契约（Harness 层）。
 * 与 `OrchestratorState.research_data` 扁平键兼容；`__*` 元键默认保留。
 */

export const RESEARCH_ASSET_SCOPE_VALUES = [
  'hotel',
  'flight',
  'destination',
  'transport',
  'compliance',
  'common',
] as const;

export type ResearchAssetScope = (typeof RESEARCH_ASSET_SCOPE_VALUES)[number];

export function isResearchAssetScope(v: unknown): v is ResearchAssetScope {
  return typeof v === 'string' && (RESEARCH_ASSET_SCOPE_VALUES as readonly string[]).includes(v);
}

/**
 * 将 research_data 顶层键归一到资产域，供局部清除与「仅重跑某域」决策。
 * 未命中启发式时归为 common（与「换酒店」类操作并列时通常保留）。
 */
export function inferResearchKeyScope(key: string): ResearchAssetScope {
  if (!key || key.startsWith('__')) return 'common';
  const k = key.toLowerCase();

  if (
    k.includes('hotel') ||
    k.includes('accommodation') ||
    k.includes('lodging') ||
    k.includes('room_stay') ||
    k.includes('booking_room')
  ) {
    return 'hotel';
  }
  if (k.includes('flight') || k.includes('amadeus') || k.includes('airfare') || k.includes('itinerary_flight')) {
    return 'flight';
  }
  if (k.includes('safetravel') || k.includes('visa') || k.includes('compliance') || k.includes('rss_refined')) {
    return 'compliance';
  }
  if (
    k.includes('transport_evidence') ||
    k.includes('transport_endpoint') ||
    k.includes('commute_matrix') ||
    (k.includes('transport') && !k.includes('flight'))
  ) {
    return 'transport';
  }
  if (
    k.includes('poi') ||
    k.includes('opening_hours') ||
    k.includes('dem_metrics') ||
    k.includes('dem.') ||
    k.includes('risk_assessment') ||
    k.includes('routecorridor') ||
    k.includes('route_corridor') ||
    k.includes('world') ||
    k.includes('weather') ||
    k.includes('prediction') ||
    k.includes('retrieval_decision') ||
    k.includes('failure_risk') ||
    k.includes('windspeed') ||
    k.includes('cost_estimate') ||
    k === 'country_code' ||
    k === 'countrycode' ||
    k === 'month'
  ) {
    return 'destination';
  }
  return 'common';
}

/** NARRATOR / UI：研究域「新鲜度」语义（缝合回退 ≠ 正常 UPDATED） */
export type ResearchScopeFreshness = 'UPDATED' | 'STALE_RECOVERED' | 'STALE' | 'UNKNOWN';

export type ResearchScopeManifest = {
  version: 1;
  scopes: Partial<
    Record<
      ResearchAssetScope,
      {
        valid: boolean;
        version: number;
        last_invalidated_at?: string;
        last_reason?: string;
        freshness?: ResearchScopeFreshness;
        last_stitch_at?: string;
        /** Trace / NLU 归因（如 `NLU:modification_targets['hotel']`） */
        attribution?: string;
        trace_id?: string;
      }
    >
  >;
  mutation_log?: Array<{ at: string; scopes: ResearchAssetScope[]; reason: string }>;
};

function bumpManifest(
  researchData: Record<string, unknown>,
  invalidated: ResearchAssetScope[],
  reason: string,
): void {
  const now = new Date().toISOString();
  const prev = (researchData.__research_asset_manifest as ResearchScopeManifest | undefined) ?? {
    version: 1,
    scopes: {},
  };
  const scopes = { ...prev.scopes };
  for (const s of invalidated) {
    const cur = scopes[s] ?? { valid: true, version: 0 };
    scopes[s] = {
      valid: false,
      version: (cur.version ?? 0) + 1,
      last_invalidated_at: now,
      last_reason: reason,
    };
  }
  const mutation_log = [...(prev.mutation_log ?? []).slice(-19), { at: now, scopes: invalidated, reason }];
  (researchData as Record<string, unknown>).__research_asset_manifest = {
    version: 1,
    scopes,
    mutation_log,
  } satisfies ResearchScopeManifest;
}

/**
 * 在 manifest 上标记某域新鲜度（如酒店缝合回退后 STALE_RECOVERED，供 NARRATOR 透明话术）。
 */
export function markResearchScopeFreshness(
  researchData: Record<string, unknown>,
  scope: ResearchAssetScope,
  freshness: ResearchScopeFreshness,
  meta?: { attribution?: string; trace_id?: string },
): void {
  const now = new Date().toISOString();
  const prev = (researchData.__research_asset_manifest as ResearchScopeManifest | undefined) ?? {
    version: 1,
    scopes: {},
  };
  const scopes = { ...prev.scopes };
  const cur = scopes[scope] ?? { valid: true, version: 0 };
  scopes[scope] = {
    ...cur,
    freshness,
    ...(meta?.attribution !== undefined ? { attribution: meta.attribution } : {}),
    ...(meta?.trace_id !== undefined ? { trace_id: meta.trace_id } : {}),
    ...(freshness === 'STALE_RECOVERED' ? { last_stitch_at: now, valid: cur.valid !== false } : {}),
  };
  (researchData as Record<string, unknown>).__research_asset_manifest = {
    version: 1,
    scopes,
    mutation_log: prev.mutation_log,
  } satisfies ResearchScopeManifest;
}

/**
 * 就地删除指定作用域下的研究键，并写入 `__research_asset_manifest`（审计 / UI）。
 */
export function invalidateResearchScopesInPlace(
  researchData: Record<string, unknown>,
  scopes: ResearchAssetScope[],
  reason: string,
): { clearedKeys: string[] } {
  if (!researchData || !scopes.length) return { clearedKeys: [] };
  const want = new Set(scopes);
  const clearedKeys: string[] = [];
  for (const key of Object.keys(researchData)) {
    if (key.startsWith('__')) continue;
    const sk = inferResearchKeyScope(key);
    if (want.has(sk)) {
      clearedKeys.push(key);
      delete researchData[key];
    }
  }
  bumpManifest(researchData, scopes, reason);
  return { clearedKeys };
}

export function dedupeResearchScopes(scopes: ResearchAssetScope[]): ResearchAssetScope[] {
  const out: ResearchAssetScope[] = [];
  const seen = new Set<string>();
  for (const s of scopes) {
    if (!isResearchAssetScope(s) || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/** RESEARCH 原子回滚 / COW：深拷贝 research_data（无 structuredClone 时 JSON 兜底） */
export function cloneResearchRecord(rd?: Record<string, unknown> | null): Record<string, unknown> | undefined {
  if (!rd || typeof rd !== 'object') return undefined;
  const sc = (globalThis as { structuredClone?: (x: unknown) => unknown }).structuredClone;
  try {
    if (typeof sc === 'function') return sc(rd) as Record<string, unknown>;
  } catch {
    // fall through
  }
  try {
    return JSON.parse(JSON.stringify(rd)) as Record<string, unknown>;
  } catch {
    return { ...rd };
  }
}
