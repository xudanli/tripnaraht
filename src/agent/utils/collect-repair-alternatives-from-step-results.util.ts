/**
 * 从 executePlan 的 `results` 中收集与 repair.apply 同构的 alternatives，
 * 供 itinerary.smart_update 与 repair.apply 自动接线（兼容 prompts 中的「alternatives.generate」命名：凡返回该形状即合并）。
 */

export interface RepairAlternativesBundle {
  alternative_pois: Array<{
    poi_id: string;
    name: string;
    reason: string;
    evidence_status: 'VERIFIED' | 'UNVERIFIED' | 'ASSUMPTION';
    evidence_refs?: string[];
  }>;
  alternative_routes: Array<{
    route_id: string;
    description: string;
    reason: string;
    evidence_status: 'VERIFIED' | 'UNVERIFIED' | 'ASSUMPTION';
    evidence_refs?: string[];
  }>;
}

function normalizeEvidenceStatus(
  x: unknown,
): 'VERIFIED' | 'UNVERIFIED' | 'ASSUMPTION' {
  return x === 'VERIFIED' || x === 'UNVERIFIED' || x === 'ASSUMPTION' ? x : 'UNVERIFIED';
}

function extractBundleFromObject(r: Record<string, unknown>): Partial<RepairAlternativesBundle> | null {
  const ap = r.alternative_pois;
  const ar = r.alternative_routes;
  if (Array.isArray(ap) || Array.isArray(ar)) {
    return {
      alternative_pois: Array.isArray(ap) ? (ap as RepairAlternativesBundle['alternative_pois']) : [],
      alternative_routes: Array.isArray(ar) ? (ar as RepairAlternativesBundle['alternative_routes']) : [],
    };
  }
  const alt = r.alternatives;
  if (alt && typeof alt === 'object' && !Array.isArray(alt)) {
    const a = alt as Record<string, unknown>;
    const ap2 = a.alternative_pois;
    const ar2 = a.alternative_routes;
    if (Array.isArray(ap2) || Array.isArray(ar2)) {
      return {
        alternative_pois: Array.isArray(ap2) ? (ap2 as RepairAlternativesBundle['alternative_pois']) : [],
        alternative_routes: Array.isArray(ar2) ? (ar2 as RepairAlternativesBundle['alternative_routes']) : [],
      };
    }
  }
  return null;
}

/** 深度扫描单条步骤结果（含嵌套 `result`） */
function collectFromOneValue(value: unknown): Partial<RepairAlternativesBundle>[] {
  const out: Partial<RepairAlternativesBundle>[] = [];
  if (!value || typeof value !== 'object') return out;
  const r = value as Record<string, unknown>;
  const direct = extractBundleFromObject(r);
  if (direct) out.push(direct);
  const inner = r.result;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    const d2 = extractBundleFromObject(inner as Record<string, unknown>);
    if (d2) out.push(d2);
  }
  return out;
}

function normalizePoi(p: Record<string, unknown>): RepairAlternativesBundle['alternative_pois'][number] {
  const poi_id = String(p.poi_id ?? p.id ?? '').trim();
  return {
    poi_id,
    name: String(p.name ?? p.title ?? 'alternative').trim() || 'alternative',
    reason: String(p.reason ?? p.summary ?? '').trim(),
    evidence_status: normalizeEvidenceStatus(p.evidence_status),
    ...(Array.isArray(p.evidence_refs) ? { evidence_refs: p.evidence_refs as string[] } : {}),
  };
}

function normalizeRoute(
  r: Record<string, unknown>,
): RepairAlternativesBundle['alternative_routes'][number] {
  const route_id = String(r.route_id ?? r.id ?? '').trim();
  return {
    route_id,
    description: String(r.description ?? r.name ?? '').trim() || route_id,
    reason: String(r.reason ?? '').trim(),
    evidence_status: normalizeEvidenceStatus(r.evidence_status),
    ...(Array.isArray(r.evidence_refs) ? { evidence_refs: r.evidence_refs as string[] } : {}),
  };
}

/**
 * 遍历步骤结果，合并所有同构 alternatives（按 poi_id / route_id 去重，后者覆盖前者）。
 */
export function collectRepairAlternativesFromStepResults(
  results: Record<string, unknown>,
): RepairAlternativesBundle {
  const poiById = new Map<string, RepairAlternativesBundle['alternative_pois'][number]>();
  const routeById = new Map<string, RepairAlternativesBundle['alternative_routes'][number]>();

  for (const value of Object.values(results)) {
    for (const part of collectFromOneValue(value)) {
      for (const raw of part.alternative_pois ?? []) {
        if (!raw || typeof raw !== 'object') continue;
        const n = normalizePoi(raw as Record<string, unknown>);
        if (n.poi_id) poiById.set(n.poi_id, n);
      }
      for (const raw of part.alternative_routes ?? []) {
        if (!raw || typeof raw !== 'object') continue;
        const n = normalizeRoute(raw as Record<string, unknown>);
        if (n.route_id) routeById.set(n.route_id, n);
      }
    }
  }

  return {
    alternative_pois: [...poiById.values()],
    alternative_routes: [...routeById.values()],
  };
}

/** 与 LLM 已写入的 input.alternatives 合并（LLM 优先覆盖同 id） */
export function mergeRepairAlternativesBundles(
  explicit: Partial<RepairAlternativesBundle> | undefined,
  fromSteps: RepairAlternativesBundle,
): RepairAlternativesBundle {
  const poiById = new Map<string, RepairAlternativesBundle['alternative_pois'][number]>();
  const routeById = new Map<string, RepairAlternativesBundle['alternative_routes'][number]>();

  for (const p of fromSteps.alternative_pois) {
    if (p.poi_id) poiById.set(p.poi_id, p);
  }
  for (const r of fromSteps.alternative_routes) {
    if (r.route_id) routeById.set(r.route_id, r);
  }
  for (const raw of explicit?.alternative_pois ?? []) {
    if (!raw || typeof raw !== 'object') continue;
    const n = normalizePoi(raw as Record<string, unknown>);
    if (n.poi_id) poiById.set(n.poi_id, n);
  }
  for (const raw of explicit?.alternative_routes ?? []) {
    if (!raw || typeof raw !== 'object') continue;
    const n = normalizeRoute(raw as Record<string, unknown>);
    if (n.route_id) routeById.set(n.route_id, n);
  }

  return {
    alternative_pois: [...poiById.values()],
    alternative_routes: [...routeById.values()],
  };
}
