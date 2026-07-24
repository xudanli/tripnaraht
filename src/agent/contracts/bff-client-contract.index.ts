/**
 * BFF-1 — Backend-defined client contract index (facts only).
 * Not a production client monorepo; paths are handoffs / contracts / sample clients.
 *
 * OpenAPI snapshot pin: evidence pack generated at FACT_PACK_OPENAPI_FREEZE_COMMIT
 * (see evidence/agent-interface-fact-pack/openapi/OPENAPI_GENERATION.txt).
 */

export const BFF_CLIENT_CONTRACT_INDEX_VERSION = '1.0.0' as const;

/** Research baseline / fact-pack OpenAPI generation commit (v1 freeze). */
export const FACT_PACK_OPENAPI_FREEZE_COMMIT =
  'a7e9bdca588431143e04e98d7c1c1204299c6e54' as const;

export const FACT_PACK_OPENAPI_GENERATION_REL =
  'evidence/agent-interface-fact-pack/openapi/OPENAPI_GENERATION.txt' as const;

export const FACT_PACK_OPENAPI_JSON_REL =
  'evidence/agent-interface-fact-pack/openapi/openapi.json' as const;

/** Critical route_and_run options OpenAPI field freeze (code SSOT, V3.1). */
export const ROUTE_AND_RUN_OPTIONS_OPENAPI_FREEZE_REL =
  'src/agent/contracts/route-and-run-options.openapi.freeze.ts' as const;

export type BffClientContractKind =
  | 'handoff'
  | 'page_ai_contract'
  | 'delivery_contract'
  | 'http_controller'
  | 'sample_ts_client'
  | 'openapi_snapshot'
  | 'openapi_field_freeze';

export type BffClientContractRow = {
  id: string;
  surface: string;
  kind: BffClientContractKind;
  /** Repo-relative path */
  path: string;
  transport: 'HTTP /api' | 'HTTP+SSE' | 'docs' | 'sample' | 'openapi';
  freshnessField?: string;
  notes: string;
};

export const BFF_CLIENT_CONTRACT_INDEX: readonly BffClientContractRow[] = [
  {
    id: 'decision_space_ios',
    surface: 'Decision Space Web/iOS',
    kind: 'handoff',
    path: 'src/decision-runtime/decision-cases/DECISION_SPACE_IOS_HANDOFF.md',
    transport: 'HTTP /api',
    freshnessField: 'contextHash (handoff samples)',
    notes: 'Backend handoff; no in-repo Swift app',
  },
  {
    id: 'arrange_ios',
    surface: 'Arrange Itinerary Web/iOS',
    kind: 'handoff',
    path: 'src/trips/arrange-itinerary/ARRANGE_ITINERARY_IOS_HANDOFF.md',
    transport: 'HTTP /api',
    freshnessField: 'contextVersion; phase CONTEXT_STALE / HTTP CONTEXT_VERSION_CONFLICT',
    notes: 'CC-1 dual-signal documented',
  },
  {
    id: 'page_ai_contracts',
    surface: 'Page Insight / Page AI',
    kind: 'page_ai_contract',
    path: 'src/trips/copilot/contracts/page-ai-contracts.ts',
    transport: 'HTTP /api',
    freshnessField: 'contextHashFields (local)',
    notes: 'Distinct from TravelContext views',
  },
  {
    id: 'page_insight_api',
    surface: 'Page Insight API doc',
    kind: 'handoff',
    path: 'src/trips/copilot/PAGE_INSIGHT_API.md',
    transport: 'HTTP /api',
    notes: 'Pairs with page-ai-contracts',
  },
  {
    id: 'trusted_delivery',
    surface: 'route_and_run trusted delivery',
    kind: 'delivery_contract',
    path: 'src/agent/delivery/FRONTEND_TRUSTED_DELIVERY.md',
    transport: 'HTTP+SSE',
    notes: 'delivery_verdict including FLAWED_DRAFT / VERIFIED_WITH_WARNINGS',
  },
  {
    id: 'flawed_draft_delivery',
    surface: 'Flawed draft FE delivery',
    kind: 'delivery_contract',
    path: 'src/agent/delivery/FRONTEND_FLAWED_DRAFT_DELIVERY.md',
    transport: 'HTTP /api',
    notes: 'Opt-in allow_flawed_draft_narrate',
  },
  {
    id: 'tep_self_drive',
    surface: 'TEP Self-drive FE',
    kind: 'handoff',
    path: 'internal-docs/frontend/TEP-SELF-DRIVE-FRONTEND-HANDOFF.md',
    transport: 'HTTP /api',
    notes: 'Internal frontend handoff',
  },
  {
    id: 'slice4_dual_read_bff',
    surface: 'Causal / dual-read BFF (internal)',
    kind: 'handoff',
    path: 'internal-docs/frontend/SLICE-4-INTERNAL-DUAL-READ-BFF-HANDOFF.md',
    transport: 'HTTP /api',
    notes: 'Internal dual-read; not a separate BFF deployable',
  },
  {
    id: 'travel_context_http',
    surface: 'TravelContext HTTP views',
    kind: 'http_controller',
    path: 'src/travel-context/travel-context.controller.ts',
    transport: 'HTTP /api',
    freshnessField: 'revision / snapshotId / basedOnRevision',
    notes: 'Target SSOT module; not main-chain SSOT (C021)',
  },
  {
    id: 'travel_context_client_types',
    surface: 'TravelContext client types',
    kind: 'sample_ts_client',
    path: 'src/travel-context/client/travel-context-api.types.ts',
    transport: 'sample',
    freshnessField: 'basedOnRevision',
    notes: 'Types for FE; not a shipping app',
  },
  {
    id: 'sample_arrange_client',
    surface: 'Arrange sample TS client',
    kind: 'sample_ts_client',
    path: 'src/trips/arrange-itinerary/dto/frontend-arrange-itinerary-api-client.ts',
    transport: 'sample',
    notes: 'Reference client only',
  },
  {
    id: 'sample_page_insight_client',
    surface: 'Page Insight sample TS client',
    kind: 'sample_ts_client',
    path: 'src/trips/copilot/dto/frontend-page-insight-api-client.ts',
    transport: 'sample',
    notes: 'Reference client only',
  },
  {
    id: 'fact_pack_openapi',
    surface: 'Fact-pack OpenAPI snapshot',
    kind: 'openapi_snapshot',
    path: FACT_PACK_OPENAPI_JSON_REL,
    transport: 'openapi',
    notes: `Pinned to FACT_PACK_OPENAPI_FREEZE_COMMIT=${FACT_PACK_OPENAPI_FREEZE_COMMIT}`,
  },
  {
    id: 'route_and_run_options_freeze',
    surface: 'route_and_run options OpenAPI field freeze',
    kind: 'openapi_field_freeze',
    path: ROUTE_AND_RUN_OPTIONS_OPENAPI_FREEZE_REL,
    transport: 'openapi',
    notes: 'execution_mode / allow_flawed_draft_narrate (C027)',
  },
] as const;

export const BFF_CLIENT_CONTRACT_INDEX_PATHS: readonly string[] =
  BFF_CLIENT_CONTRACT_INDEX.map((r) => r.path);
