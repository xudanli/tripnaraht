// src/agent/memory/utils/memory-snapshot-freeze.util.ts
import type { AgentMemoryContext } from '../interfaces/agent-memory-context.interface';

const MAX_DEPTH = 14;

function deepFreeze(o: unknown, depth = 0): void {
  if (depth > MAX_DEPTH || o === null || typeof o !== 'object') {
    return;
  }
  if (Object.isFrozen(o as object)) {
    return;
  }
  Object.freeze(o as object);
  if (Array.isArray(o)) {
    for (const el of o) {
      deepFreeze(el, depth + 1);
    }
    return;
  }
  const proto = Object.getPrototypeOf(o);
  if (proto !== null && proto !== Object.prototype) {
    return;
  }
  for (const k of Object.keys(o as Record<string, unknown>)) {
    const v = (o as Record<string, unknown>)[k];
    if (v !== null && typeof v === 'object') {
      deepFreeze(v, depth + 1);
    }
  }
}

/**
 * P2：Runtime 内禁止就地 mutate snapshot（防止 ctx.userProfile.x = … 破坏因果一致性）。
 */
export function freezeAgentMemorySnapshot(ctx: AgentMemoryContext): AgentMemoryContext {
  deepFreeze(ctx as unknown);
  return ctx;
}
