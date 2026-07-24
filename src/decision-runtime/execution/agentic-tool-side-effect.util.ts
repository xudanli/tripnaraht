/**
 * Agentic MCP tool side-effect classification for Canonical Mutation Commit Guard.
 */

import { isEffectivePlanWriteChainEnabled } from './effective-plan-write-chain.config';

export type ToolSideEffect =
  | 'NONE'
  | 'READ_EXTERNAL'
  | 'TRIP_MUTATION'
  | 'EXTERNAL_ACTION'
  | 'UNKNOWN';

/** Explicit read-only tools (MCP toolName). */
const READ_ONLY_TOOL_NAMES = new Set([
  'weather.getForecast',
  'weather.get_current',
  'exa.search',
  'exa.deepSearch',
  'exa.answer',
  'hotel.search',
  'hotel.searchHotels',
]);

const TRIP_MUTATION_PATTERNS: RegExp[] = [
  /(?:^|[._-])(?:update|patch|write|mutate|apply|move|delete|remove|insert|reorder|swap|shift|replace)(?:[._-]|$)/i,
  /itinerary/i,
  /trip[._-]?(?:update|patch|write|mutate|apply|edit)/i,
  /apply[_-]?repair/i,
  /feasibility[._-]apply/i,
  /plan[._-]?(?:update|write|commit|apply)/i,
  /day[._-]?(?:update|reorder|mutate)/i,
  /item[._-]?(?:move|delete|update|add)/i,
];

const EXTERNAL_ACTION_PATTERNS: RegExp[] = [
  /(?:^|[._-])(?:book|booking|checkout|pay|payment|purchase|cancel|refund|confirm|reserve)/i,
  /send(?:[._-]?(?:mail|email|message))?/i,
];

const READ_EXTERNAL_PATTERNS: RegExp[] = [
  /(?:^|[._-])(?:get|fetch|search|lookup|query|list|read|find|check)(?:[._-]|$)/i,
  /weather/i,
  /exa/i,
  /hotel[._-]?search/i,
];

export function classifyAgenticToolSideEffect(mcpToolName: string): ToolSideEffect {
  const name = String(mcpToolName ?? '').trim();
  if (!name) return 'UNKNOWN';

  if (READ_ONLY_TOOL_NAMES.has(name)) {
    return 'READ_EXTERNAL';
  }

  for (const re of TRIP_MUTATION_PATTERNS) {
    if (re.test(name)) return 'TRIP_MUTATION';
  }

  for (const re of EXTERNAL_ACTION_PATTERNS) {
    if (re.test(name)) return 'EXTERNAL_ACTION';
  }

  for (const re of READ_EXTERNAL_PATTERNS) {
    if (re.test(name)) return 'READ_EXTERNAL';
  }

  return 'UNKNOWN';
}

export function isAgenticSideEffectReadOnly(effect: ToolSideEffect): boolean {
  return effect === 'NONE' || effect === 'READ_EXTERNAL';
}

export function resolveAgenticMutationWriteGuardMode(): 'OFF' | 'SHADOW' | 'ENFORCE' {
  const raw = process.env.AGENTIC_MUTATION_WRITE_GUARD?.trim().toUpperCase();
  if (raw === 'OFF' || raw === '0' || raw === 'FALSE') return 'OFF';
  if (raw === 'SHADOW') return 'SHADOW';
  if (raw === 'ENFORCE' || raw === '1' || raw === 'TRUE') return 'ENFORCE';
  // EFFECTIVE_PLAN_WRITE_CHAIN=1 ⇒ MCP TRIP_MUTATION 须带 MutationAuthorityEnvelope
  if (isEffectivePlanWriteChainEnabled()) return 'ENFORCE';
  return 'ENFORCE';
}

/** Write chain 开启且未显式关闭 agentic guard */
export function isAgenticMutationGuardForcedByWriteChain(): boolean {
  const raw = process.env.AGENTIC_MUTATION_WRITE_GUARD?.trim();
  if (!raw) return isEffectivePlanWriteChainEnabled();
  return false;
}

export function isAgenticMutationWriteGuardActive(): boolean {
  return resolveAgenticMutationWriteGuardMode() !== 'OFF';
}

export function isAgenticMutationWriteGuardEnforce(): boolean {
  return resolveAgenticMutationWriteGuardMode() === 'ENFORCE';
}
