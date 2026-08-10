/**
 * Normalize FE pageMode / insightScope aliases for page-insights:evaluate.
 */

export type CopilotPageModeDto =
  | 'ACTIVITY_EDITOR'
  | 'ITINERARY_DAY_EDITOR'
  | 'PLANNING_OVERVIEW'
  | 'EXECUTION_HOME';

export type CopilotInsightScopeDto =
  | 'ACTIVITY'
  | 'ACTIVITY_INSERTION'
  | 'ITINERARY_DAY'
  | 'TRIP'
  | 'EXECUTION';

function canonKey(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toUpperCase();
}

/** Normalize FE aliases / camelCase / swapped pageMode↔scope values. */
export function normalizeCopilotPageMode(
  value: unknown,
): CopilotPageModeDto | undefined {
  if (value == null || value === '') return undefined;
  const key = canonKey(value);

  const map: Record<string, CopilotPageModeDto | undefined> = {
    ACTIVITY_EDITOR: 'ACTIVITY_EDITOR',
    ACTIVITY: 'ACTIVITY_EDITOR',
    ACTIVITY_INSERTION: 'ACTIVITY_EDITOR',
    ITINERARY_DAY_EDITOR: 'ITINERARY_DAY_EDITOR',
    ITINERARY_DAY: 'ITINERARY_DAY_EDITOR',
    ITINERARY_EDITOR: 'ITINERARY_DAY_EDITOR',
    SELECTED_DAY: 'ITINERARY_DAY_EDITOR',
    DAY_EDITOR: 'ITINERARY_DAY_EDITOR',
    PLANNING_OVERVIEW: 'PLANNING_OVERVIEW',
    OVERVIEW: 'PLANNING_OVERVIEW',
    TRIP: 'PLANNING_OVERVIEW',
    EXECUTION_HOME: 'EXECUTION_HOME',
    EXECUTION: 'EXECUTION_HOME',
    // Decision space does not use pageMode — drop so validation passes.
    DECISION_SPACE: undefined,
  };
  if (Object.prototype.hasOwnProperty.call(map, key)) return map[key];
  return undefined;
}

export function normalizeCopilotInsightScope(
  value: unknown,
): CopilotInsightScopeDto | undefined {
  if (value == null || value === '') return undefined;
  const key = canonKey(value);

  const map: Record<string, CopilotInsightScopeDto | undefined> = {
    ACTIVITY: 'ACTIVITY',
    ACTIVITY_INSERTION: 'ACTIVITY_INSERTION',
    ACTIVITY_EDITOR: 'ACTIVITY',
    ITINERARY_DAY: 'ITINERARY_DAY',
    ITINERARY_DAY_EDITOR: 'ITINERARY_DAY',
    SELECTED_DAY: 'ITINERARY_DAY',
    DAY: 'ITINERARY_DAY',
    TRIP: 'TRIP',
    PLANNING_OVERVIEW: 'TRIP',
    OVERVIEW: 'TRIP',
    EXECUTION: 'EXECUTION',
    EXECUTION_HOME: 'EXECUTION',
    DECISION_SPACE: undefined,
  };
  if (Object.prototype.hasOwnProperty.call(map, key)) return map[key];
  return undefined;
}

/** When FE omits/swaps fields, derive from pageId. */
export function defaultPageModeForPageId(
  pageId: unknown,
): CopilotPageModeDto | undefined {
  switch (canonKey(pageId)) {
    case 'ACTIVITY_EDITOR':
      return 'ACTIVITY_EDITOR';
    case 'ITINERARY_DAY_EDITOR':
    case 'ITINERARY_EDITOR':
      return 'ITINERARY_DAY_EDITOR';
    case 'PLANNING_OVERVIEW':
      return 'PLANNING_OVERVIEW';
    case 'EXECUTION_HOME':
      return 'EXECUTION_HOME';
    default:
      return undefined;
  }
}

export function defaultInsightScopeForPageId(
  pageId: unknown,
): CopilotInsightScopeDto | undefined {
  switch (canonKey(pageId)) {
    case 'ACTIVITY_EDITOR':
      return 'ACTIVITY';
    case 'ITINERARY_DAY_EDITOR':
    case 'ITINERARY_EDITOR':
      return 'ITINERARY_DAY';
    case 'PLANNING_OVERVIEW':
      return 'TRIP';
    case 'EXECUTION_HOME':
      return 'EXECUTION';
    default:
      return undefined;
  }
}
