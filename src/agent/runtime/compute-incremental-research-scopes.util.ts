import type { DecisionOsExecutionContext } from './decision-os-execution-context';
import type { PlanDeltaIR } from '../contracts/plan-delta-ir.types';

export type IncrementalResearchDomain =
  | 'hotel'
  | 'flight'
  | 'poi'
  | 'transit'
  | 'global';

export type IncrementalInvalidationType = 'FULL' | 'PARTIAL_CONSTRAINED';

/**
 * Fiber 级增量研究失效作用域（比 ResearchAssetScope 更细；下游 Research Graph 可消费）。
 */
export interface IncrementalResearchScope {
  domain: IncrementalResearchDomain;
  /** 精准失效主键，如 `trip_123:day_1:transit_mesh` */
  scopeId: string;
  dayIndex?: number;
  invalidationType: IncrementalInvalidationType;
  reason: string;
}

function dayKey(dayIndex: number | undefined): string {
  return dayIndex !== undefined ? `day_${dayIndex}` : 'all_days';
}

function pushScope(
  scopes: IncrementalResearchScope[],
  scope: IncrementalResearchScope,
): void {
  scopes.push(scope);
}

/**
 * 依据 Plan Delta AST 驱动的增量失效依赖图计算器。
 * 替代 legacy `extractNluResearchInvalidateScopes` 的粗粒度域清空。
 */
export function computeIncrementalResearchScopes(
  context: DecisionOsExecutionContext,
): IncrementalResearchScope[] {
  const deltas = context.planDelta;
  if (!deltas || deltas.length === 0) {
    return [];
  }

  const scopes: IncrementalResearchScope[] = [];
  const tripId = context.tripId || 'temp';

  for (const delta of deltas) {
    applyDeltaToScopes(scopes, delta, tripId);
  }

  return deduplicateIncrementalScopes(scopes);
}

function applyDeltaToScopes(
  scopes: IncrementalResearchScope[],
  delta: PlanDeltaIR,
  tripId: string,
): void {
  const { op, target } = delta;
  const dayStr = dayKey(target.dayIndex);

  switch (target.type) {
    case 'HOTEL':
      pushScope(scopes, {
        domain: 'hotel',
        scopeId: `${tripId}:${dayStr}:hotel:${target.id || 'any'}`,
        dayIndex: target.dayIndex,
        invalidationType: target.id ? 'PARTIAL_CONSTRAINED' : 'FULL',
        reason: `Delta IR [${op}] HOTEL id=${target.id ?? 'N/A'} day=${target.dayIndex ?? 'all'}`,
      });
      break;

    case 'POI':
      pushScope(scopes, {
        domain: 'poi',
        scopeId: `${tripId}:${dayStr}:poi:${target.id || 'any'}`,
        dayIndex: target.dayIndex,
        invalidationType: target.id ? 'PARTIAL_CONSTRAINED' : 'FULL',
        reason: `Delta IR [${op}] POI day=${target.dayIndex ?? 'all'}`,
      });
      pushScope(scopes, {
        domain: 'transit',
        scopeId: `${tripId}:${dayStr}:transit_mesh`,
        dayIndex: target.dayIndex,
        invalidationType: 'FULL',
        reason: `Cascaded: transit affected by POI [${op}] day=${target.dayIndex ?? 'all'}`,
      });
      break;

    case 'FLIGHT':
      pushScope(scopes, {
        domain: 'flight',
        scopeId: `${tripId}:flight_segment:${target.id || 'all'}`,
        invalidationType: 'FULL',
        reason: `Delta IR [${op}] FLIGHT id=${target.id ?? 'all'}`,
      });
      break;

    case 'ROUTE_CONSTRAINT':
    case 'RESTRICTION':
      if (target.dayIndex !== undefined) {
        pushScope(scopes, {
          domain: 'transit',
          scopeId: `${tripId}:${dayStr}:transit_mesh`,
          dayIndex: target.dayIndex,
          invalidationType: 'FULL',
          reason: `Constraint drift [${op}] on day ${target.dayIndex}`,
        });
      } else if (target.zoneId) {
        pushScope(scopes, {
          domain: 'transit',
          scopeId: `${tripId}:zone_${target.zoneId}:transit_mesh`,
          invalidationType: 'FULL',
          reason: `Constraint drift [${op}] zone=${target.zoneId}`,
        });
      } else {
        pushScope(scopes, {
          domain: 'global',
          scopeId: `${tripId}:route_constraint:global`,
          invalidationType: 'FULL',
          reason: `Constraint drift [${op}] (global)`,
        });
      }
      break;

    default:
      break;
  }
}

export function deduplicateIncrementalScopes(
  scopes: IncrementalResearchScope[],
): IncrementalResearchScope[] {
  const seen = new Set<string>();
  return scopes.filter((s) => {
    const key = `${s.domain}::${s.scopeId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
