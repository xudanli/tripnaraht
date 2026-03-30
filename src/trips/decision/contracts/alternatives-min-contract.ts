/**
 * TD-03：OrchestratorState.alternatives / DSO `tripState.orchestratorAlternatives` 最小可执行性
 *（与 AO-04 计数口径一致；Kernel `executeGateEval` BLOCK 时写入 DSO，见 replan 持久化）
 */

export function countTripAlternativesFromOrchestratorShape(alternatives: unknown): number {
  if (alternatives === null || typeof alternatives !== 'object' || Array.isArray(alternatives)) {
    return 0;
  }
  const a = alternatives as Record<string, unknown>;
  const pois = Array.isArray(a.alternative_pois) ? a.alternative_pois.length : 0;
  const routes = Array.isArray(a.alternative_routes) ? a.alternative_routes.length : 0;
  return pois + routes;
}

/** BLOCK 时建议至少 1 条可执行替代（协议 `.claude/claude_exec.md` §2） */
export function alternativesSatisfyBlockedGateMin(
  gateResult: string | undefined,
  alternatives: unknown,
): { ok: boolean; count: number } {
  const count = countTripAlternativesFromOrchestratorShape(alternatives);
  if (gateResult !== 'BLOCK') {
    return { ok: true, count };
  }
  return { ok: count >= 1, count };
}

function nonEmptyString(v: unknown): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

/** TD-03 加深：替代项需稳定 id（`poi_id` / `route_id`）与可读 `name`/`reason`（POI）、`description`/`reason`（路线） */
export function alternativesReadabilityIssues(alternatives: unknown): string[] {
  const issues: string[] = [];
  if (alternatives === null || typeof alternatives !== 'object' || Array.isArray(alternatives)) {
    return issues;
  }
  const a = alternatives as Record<string, unknown>;
  const pois = Array.isArray(a.alternative_pois) ? a.alternative_pois : [];
  pois.forEach((poi, i) => {
    if (!poi || typeof poi !== 'object' || Array.isArray(poi)) {
      issues.push(`alternative_pois[${i}] must be an object`);
      return;
    }
    const p = poi as Record<string, unknown>;
    if (!nonEmptyString(p.poi_id)) {
      issues.push(`alternative_pois[${i}].poi_id must be non-empty (stable id)`);
    }
    if (!nonEmptyString(p.name)) {
      issues.push(`alternative_pois[${i}].name must be non-empty`);
    }
    if (!nonEmptyString(p.reason)) {
      issues.push(`alternative_pois[${i}].reason must be non-empty (tradeoff / why)`);
    }
  });
  const routes = Array.isArray(a.alternative_routes) ? a.alternative_routes : [];
  routes.forEach((route, i) => {
    if (!route || typeof route !== 'object' || Array.isArray(route)) {
      issues.push(`alternative_routes[${i}] must be an object`);
      return;
    }
    const r = route as Record<string, unknown>;
    if (!nonEmptyString(r.route_id)) {
      issues.push(`alternative_routes[${i}].route_id must be non-empty (stable id)`);
    }
    if (!nonEmptyString(r.description)) {
      issues.push(`alternative_routes[${i}].description must be non-empty`);
    }
    if (!nonEmptyString(r.reason)) {
      issues.push(`alternative_routes[${i}].reason must be non-empty (tradeoff / why)`);
    }
  });
  return issues;
}
