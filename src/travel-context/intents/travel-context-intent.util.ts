import type { TravelContextDomain } from '../domain/travel-context.constants';
import type { TravelContextSnapshot } from '../domain/travel-context.types';

export function domainsChanged(
  before: TravelContextSnapshot,
  after: TravelContextSnapshot,
): TravelContextDomain[] {
  const changed: TravelContextDomain[] = [];
  if (JSON.stringify(before.intent) !== JSON.stringify(after.intent)) changed.push('intent');
  if (JSON.stringify(before.plan) !== JSON.stringify(after.plan)) changed.push('plan');
  if (JSON.stringify(before.world) !== JSON.stringify(after.world)) changed.push('world');
  if (JSON.stringify(before.decisions) !== JSON.stringify(after.decisions)) changed.push('decisions');
  if (JSON.stringify(before.monitoring) !== JSON.stringify(after.monitoring)) {
    changed.push('monitoring');
  }
  if (JSON.stringify(before.contract) !== JSON.stringify(after.contract)) changed.push('contract');
  if (JSON.stringify(before.participants) !== JSON.stringify(after.participants)) {
    changed.push('participants');
  }
  if (JSON.stringify(before.history) !== JSON.stringify(after.history)) changed.push('history');
  return changed;
}

export function readPayloadString(payload: Record<string, unknown> | undefined, key: string): string {
  const value = payload?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

export function readPayloadProblemId(payload: Record<string, unknown> | undefined): string {
  return readPayloadString(payload, 'problemId') || readPayloadString(payload, 'decisionId');
}
