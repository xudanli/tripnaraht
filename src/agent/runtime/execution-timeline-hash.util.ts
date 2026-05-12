// src/agent/runtime/execution-timeline-hash.util.ts
import { createHash } from 'crypto';

export function sortKeysDeep(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  const o = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(o).sort()) {
    out[k] = sortKeysDeep(o[k]);
  }
  return out;
}

export function executionTimelineInputHash(payload: unknown): string | null {
  if (payload === undefined) return null;
  try {
    const s = typeof payload === 'string' ? payload : JSON.stringify(sortKeysDeep(payload));
    return createHash('sha256').update(s).digest('hex');
  } catch {
    return null;
  }
}
