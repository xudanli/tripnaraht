/**
 * AsyncLocalStorage for bound DecisionContext — adapters resolve current snapshot without deep prop drilling.
 * Wire `runWithDecisionContext` around decision ticks when Layer 3 ingress is enabled.
 */

import { AsyncLocalStorage } from 'async_hooks';
import type { DecisionContextV0 } from './decision-context.types';

const storage = new AsyncLocalStorage<DecisionContextV0 | undefined>();

export function runWithDecisionContext<T>(ctx: DecisionContextV0 | undefined, fn: () => T): T {
  return storage.run(ctx, fn);
}

export async function runWithDecisionContextAsync<T>(
  ctx: DecisionContextV0 | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(ctx, fn);
}

export function getBoundDecisionContext(): DecisionContextV0 | undefined {
  return storage.getStore();
}
