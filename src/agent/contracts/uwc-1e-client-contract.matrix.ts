/**
 * UWC-1e client contract matrix — Web/iOS first-batch writeback compliance.
 */

export const UWC_1E_CLIENT_CONTRACT_MATRIX_VERSION = '1.0.0' as const;

export type Uwc1eClientContractRow = {
  id: string;
  surface: 'web' | 'ios' | 'shared';
  slice:
    | 'actions_commit'
    | 'itinerary_same_day_time_adjust'
    | 'itinerary_same_day_add_item'
    | 'itinerary_same_day_add_from_candidates'
    | 'itinerary_multi_day_add_from_candidates'
    | 'itinerary_same_day_remove_item'
    | 'itinerary_same_day_reorder_items'
    | 'itinerary_same_day_move_and_add'
    | 'itinerary_same_day_reduce_intensity'
    | 'unified_plan_version_only'
    | 'protocol';
  path: string;
  role: 'page_api' | 'commit_gate' | 'sample_client' | 'handoff' | 'http' | 'openapi';
  mayCallApply: boolean;
  mayMutateTokens: boolean;
  notes: string;
};

export const UWC_1E_CLIENT_CONTRACT_MATRIX: readonly Uwc1eClientContractRow[] = [
  {
    id: 'shared_page_api',
    surface: 'shared',
    slice: 'protocol',
    path: 'src/decision-runtime/execution/authoritative-write/client-write-protocol.page-api.ts',
    role: 'page_api',
    mayCallApply: false,
    mayMutateTokens: false,
    notes: 'Preview+Confirm only; sealed handles',
  },
  {
    id: 'shared_commit_gate',
    surface: 'shared',
    slice: 'protocol',
    path: 'src/decision-runtime/execution/authoritative-write/client-write-protocol.commit-gate.ts',
    role: 'commit_gate',
    mayCallApply: true,
    mayMutateTokens: false,
    notes: 'Shell-only Apply; autoUndo=false',
  },
  {
    id: 'shared_seal',
    surface: 'shared',
    slice: 'protocol',
    path: 'src/decision-runtime/execution/authoritative-write/client-write-protocol.seal.ts',
    role: 'page_api',
    mayCallApply: false,
    mayMutateTokens: false,
    notes: 'Immutable previewHash/expectedVersion/verificationProof/confirmationToken',
  },
  {
    id: 'web_sample_client',
    surface: 'web',
    slice: 'protocol',
    path: 'src/trips/dto/frontend-uwc-1e-api-client.ts',
    role: 'sample_client',
    mayCallApply: false,
    mayMutateTokens: false,
    notes: 'Web pageApi + shell commitGate; first-batch helpers',
  },
  {
    id: 'ios_sample_client',
    surface: 'ios',
    slice: 'protocol',
    path: 'src/trips/dto/frontend-uwc-1e-ios-api-client.ts',
    role: 'sample_client',
    mayCallApply: false,
    mayMutateTokens: false,
    notes: 'iOS mirror of Web; productSurface=ios',
  },
  {
    id: 'web_ios_handoff',
    surface: 'shared',
    slice: 'protocol',
    path: 'src/decision-runtime/execution/authoritative-write/UWC_1E_WEB_IOS_HANDOFF.md',
    role: 'handoff',
    mayCallApply: false,
    mayMutateTokens: false,
    notes: 'Shared Web/iOS handoff; Swift sketch included',
  },
  {
    id: 'openapi_freeze',
    surface: 'shared',
    slice: 'protocol',
    path: 'src/decision-runtime/execution/authoritative-write/client-write-protocol.openapi.freeze.ts',
    role: 'openapi',
    mayCallApply: false,
    mayMutateTokens: false,
    notes: 'One OpenAPI for Web and iOS',
  },
  {
    id: 'http_controller',
    surface: 'shared',
    slice: 'protocol',
    path: 'src/decision-runtime/execution/authoritative-write/client-write-protocol.controller.ts',
    role: 'http',
    mayCallApply: true,
    mayMutateTokens: false,
    notes: 'POST /api/uwc/v1/write/{preview,confirm,apply}',
  },
] as const;

export const UWC_1E_FIRST_BATCH_CLIENT_FLOWS = [
  {
    id: 'execution_remind',
    slice: 'actions_commit' as const,
    action: 'execution.remind',
    surfaces: ['web', 'ios'] as const,
  },
  {
    id: 'same_day_time_adjust',
    slice: 'itinerary_same_day_time_adjust' as const,
    action: 'same_day_time_adjust',
    surfaces: ['web', 'ios'] as const,
  },
  {
    id: 'same_day_add_item',
    slice: 'itinerary_same_day_add_item' as const,
    action: 'same_day_add_item',
    surfaces: ['web', 'ios'] as const,
  },
  {
    id: 'same_day_add_from_candidates',
    slice: 'itinerary_same_day_add_from_candidates' as const,
    action: 'same_day_add_from_candidates',
    surfaces: ['web', 'ios'] as const,
  },
  {
    id: 'multi_day_add_from_candidates',
    slice: 'itinerary_multi_day_add_from_candidates' as const,
    action: 'multi_day_add_from_candidates',
    surfaces: ['web', 'ios'] as const,
  },
  {
    id: 'same_day_remove_item',
    slice: 'itinerary_same_day_remove_item' as const,
    action: 'same_day_remove_item',
    surfaces: ['web', 'ios'] as const,
  },
  {
    id: 'same_day_reorder_items',
    slice: 'itinerary_same_day_reorder_items' as const,
    action: 'same_day_reorder_items',
    surfaces: ['web', 'ios'] as const,
  },
  {
    id: 'same_day_move_and_add',
    slice: 'itinerary_same_day_move_and_add' as const,
    action: 'same_day_move_and_add',
    surfaces: ['web', 'ios'] as const,
  },
  {
    id: 'same_day_reduce_intensity',
    slice: 'itinerary_same_day_reduce_intensity' as const,
    action: 'same_day_reduce_intensity',
    surfaces: ['web', 'ios'] as const,
  },
  {
    id: 'unified_plan_version_only',
    slice: 'unified_plan_version_only' as const,
    action: 'verified_plan_version_only',
    surfaces: ['web', 'ios'] as const,
  },
] as const;

export const UWC_1E_CLIENT_HARD_RULES = {
  pagesMustNotCallApply: true,
  conflictOrExpiredMustRePreview: true,
  verificationRequiredNoBypass: true,
  rejectedNoBypass: true,
  noAutoUndo: true,
  noMixedTargets: true,
  noIcelandMobileWriteback: true,
  noGlobalOccUnlock: true,
  noCompensationUnlock: true,
  immutableTokenFields: [
    'previewHash',
    'expectedVersion',
    'verificationProof',
    'confirmationToken',
  ] as const,
} as const;
