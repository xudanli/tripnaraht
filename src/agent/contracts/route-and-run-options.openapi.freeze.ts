/**
 * Frozen OpenAPI surface for critical route_and_run options.
 * Must stay aligned with RouteAndRunOptionsDto ApiPropertyOptional metadata.
 */
export const ROUTE_AND_RUN_OPTIONS_OPENAPI_FREEZE = {
  execution_mode: {
    name: 'execution_mode',
    enum: ['ADVICE_ONLY', 'SEMI_AUTO', 'AUTO'] as const,
    default: 'ADVICE_ONLY' as const,
    required: false,
  },
  allow_flawed_draft_narrate: {
    name: 'allow_flawed_draft_narrate',
    type: 'boolean' as const,
    required: false,
    default: undefined,
  },
} as const;

export type RouteAndRunExecutionModeFreeze =
  (typeof ROUTE_AND_RUN_OPTIONS_OPENAPI_FREEZE.execution_mode.enum)[number];
