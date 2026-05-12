/**
 * 世界快照确定性哈希 — 用于回放日志每条 transition 后的 `resultingStateHash`
 */

import { createHash } from 'node:crypto';
import type { WorldConstraintStore } from '../world-constraint.store';
import { snapshotWorldConstraintStore } from '../world-snapshot';

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((x) => stableStringify(x)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const inner = keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',');
  return `{${inner}}`;
}

export function hashWorldConstraintStore(store: WorldConstraintStore): string {
  const snap = snapshotWorldConstraintStore(store);
  return createHash('sha256').update(stableStringify(snap)).digest('hex');
}
