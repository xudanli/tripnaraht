/** RFC-003 Travel Context Protocol — schema identifiers */

export const TRAVEL_CONTEXT_SNAPSHOT_SCHEMA_ID =
  'tripnara.travel_context_snapshot@v1' as const;

export const TRAVEL_CONTEXT_IDENTITY_SCHEMA_ID =
  'tripnara.travel_context_identity@v1' as const;

export const TRAVEL_CONTEXT_VIEW_NAMES = [
  'overview',
  'exploration',
  'plan',
  'decisions',
  'monitoring',
  'participants',
  'feasibility',
  'assistant',
] as const;

export type TravelContextViewName = (typeof TRAVEL_CONTEXT_VIEW_NAMES)[number];

export const TRAVEL_CONTEXT_STAGES = [
  'CONVERSATION',
  'EXPLORATION',
  'SCENARIO_SELECTED',
  'TRIP_MATERIALIZED',
  'PLANNING',
  'READY',
  'TRAVELING',
  'COMPLETED',
] as const;

export type TravelContextStage = (typeof TRAVEL_CONTEXT_STAGES)[number];

export const TRAVEL_CONTEXT_DOMAINS = [
  'intent',
  'participants',
  'contract',
  'plan',
  'world',
  'decisions',
  'monitoring',
  'history',
] as const;

export type TravelContextDomain = (typeof TRAVEL_CONTEXT_DOMAINS)[number];
