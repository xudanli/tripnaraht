export const TEP_REPAIR_INTERVENTION_PREFIX = 'intervention-tep-';

/** Normalize intervention id (`intervention-tep-*`) or raw RecoveryOption.optionId */
export function parseTepRepairOptionId(interventionOrOptionId: string): string {
  if (interventionOrOptionId.startsWith(TEP_REPAIR_INTERVENTION_PREFIX)) {
    return interventionOrOptionId.slice(TEP_REPAIR_INTERVENTION_PREFIX.length);
  }
  return interventionOrOptionId;
}

export function buildTepRepairInterventionId(optionId: string): string {
  return `${TEP_REPAIR_INTERVENTION_PREFIX}${optionId}`;
}

export function buildTepRepairIdempotencyKey(tripId: string, optionId: string): string {
  return `trip:${tripId}:tep-repair:${optionId}`;
}

export function buildTepRepairDecisionId(optionId: string): string {
  return `tep_repair_${optionId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)}`;
}

export function buildTepRepairPlanVersionId(parentId: string, optionId: string): string {
  const slug = optionId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
  return `${parentId}_tep_${slug}`;
}

/** `activity_{itemId}` → itinerary item id */
export function resolveItineraryItemIdFromActivityRef(ref: string): string | undefined {
  if (!ref.startsWith('activity_')) return undefined;
  const itemId = ref.slice('activity_'.length);
  return itemId.length > 0 ? itemId : undefined;
}
