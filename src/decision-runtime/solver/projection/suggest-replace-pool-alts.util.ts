/**
 * Shadow REPLACE_POOL suggestions — Iceland curated fixture first (ADR-008 S3).
 * Sync / no I/O. Synthetic fallback keeps Python REPLACE path non-empty.
 */

import { ICELAND_POI_ALTERNATIVES } from '../../../poi-access-capacity/fixtures/iceland-poi-alternatives';

export type ReplacePoolAltSource = 'fixture' | 'synthetic';

export interface ReplacePoolAlt {
  /** Solver node id for the alternate visit */
  nodeId: string;
  poiId: string;
  name: string;
  reason?: string;
  source: ReplacePoolAltSource;
  dwellMinutes?: number;
}

/** alt:{from} or alt:{from}:{index} */
export function replaceAlternateNodeId(fromNodeId: string, index = 0): string {
  return index === 0 ? `alt:${fromNodeId}` : `alt:${fromNodeId}:${index}`;
}

export function parseReplaceAlternateNodeId(
  nodeId: string,
): { fromNodeId: string; index: number } | null {
  if (!nodeId.startsWith('alt:')) return null;
  const body = nodeId.slice('alt:'.length);
  const m = /^(.*):(\d+)$/.exec(body);
  if (m) {
    return { fromNodeId: m[1]!, index: Number(m[2]) };
  }
  return { fromNodeId: body, index: 0 };
}

export function suggestReplacePoolAlts(input: {
  fromNodeId: string;
  poiId?: string;
  countryCode?: string;
  limit?: number;
  excludePoiIds?: string[];
  serviceDurationMin?: number;
}): ReplacePoolAlt[] {
  const limit = Math.max(1, Math.min(input.limit ?? 3, 5));
  const exclude = new Set(input.excludePoiIds ?? []);
  const country = (input.countryCode ?? 'IS').toUpperCase();
  const out: ReplacePoolAlt[] = [];

  if (country === 'IS' && input.poiId) {
    const fixtures = ICELAND_POI_ALTERNATIVES[input.poiId] ?? [];
    for (const alt of fixtures) {
      if (exclude.has(alt.poiId)) continue;
      out.push({
        nodeId: replaceAlternateNodeId(input.fromNodeId, out.length),
        poiId: alt.poiId,
        name: alt.name,
        reason: alt.reason,
        source: 'fixture',
        dwellMinutes: input.serviceDurationMin,
      });
      if (out.length >= limit) return out;
    }
  }

  // Always keep at least one synthetic slot so REPLACE_POOL ≠ drop-only
  if (out.length === 0) {
    out.push({
      nodeId: replaceAlternateNodeId(input.fromNodeId, 0),
      poiId: input.poiId ? `${input.poiId}-alt` : `poi-alt-${input.fromNodeId}`,
      name: 'synthetic alternate',
      reason: 'fixture miss — placeholder for matrix REPLACE',
      source: 'synthetic',
      dwellMinutes: input.serviceDurationMin,
    });
  }

  return out.slice(0, limit);
}
