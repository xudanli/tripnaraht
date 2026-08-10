/**
 * Frozen OpenAPI surface for UWC-1e — Web and iOS MUST share this document.
 * Do not fork paths/enums per client.
 */

import {
  UWC_1E_APPLY_PIPELINE_STAGES,
  UWC_1E_CLIENT_OUTCOMES,
  UWC_1E_EXCLUDED_CAPABILITIES,
  UWC_1E_FIRST_BATCH_SLICES,
  UWC_1E_PRODUCT_SURFACES,
  UWC_1E_PROTOCOL_VERSION,
  UWC_1E_SCHEMA_ID,
  UWC_1E_SESSION_STATES,
} from './client-write-protocol.types';
import { UNIFIED_WRITE_PROTOCOL_STAGES } from './authoritative-write.types';

export const UWC_1E_OPENAPI_FREEZE = {
  openapi: '3.0.3' as const,
  info: {
    title: 'TripNara UWC-1e Client Write Protocol',
    version: UWC_1E_PROTOCOL_VERSION,
    description:
      'Shared Web/iOS Preview → Confirm → Apply. Preview=draft only; Confirm=explicit confirm only; Apply=Authority/Verification/Idempotency/OCC/Handler/Transaction/Audit.',
  },
  servers: [{ url: '/uwc/v1', description: 'Relative to Nest globalPrefix /api → /api/uwc/v1' }],
  paths: {
    '/write/preview': {
      post: {
        operationId: 'uwc1ePreview',
        summary: 'Generate write draft only (no Apply pipeline)',
        tags: ['UWC-1e'],
        'x-uwc-stage': 'PREVIEW',
        'x-uwc-writes': false,
        'x-uwc-apply-pipeline': false,
      },
    },
    '/write/confirm': {
      post: {
        operationId: 'uwc1eConfirm',
        summary: 'Record explicit confirmation only (no Apply pipeline)',
        tags: ['UWC-1e'],
        'x-uwc-stage': 'CONFIRM',
        'x-uwc-writes': false,
        'x-uwc-apply-pipeline': false,
        'x-uwc-requires-explicit-confirm': true,
      },
    },
    '/write/apply': {
      post: {
        operationId: 'uwc1eApply',
        summary:
          'Enter Authority → Verification → Idempotency → OCC → Handler → Transaction → Audit',
        tags: ['UWC-1e'],
        'x-uwc-stage': 'APPLY',
        'x-uwc-writes': true,
        'x-uwc-apply-pipeline': true,
        'x-uwc-pipeline-stages': [...UWC_1E_APPLY_PIPELINE_STAGES],
      },
    },
  },
  components: {
    schemas: {
      Uwc1eSchemaId: {
        type: 'string' as const,
        enum: [UWC_1E_SCHEMA_ID],
      },
      Uwc1eProtocolVersion: {
        type: 'string' as const,
        enum: [UWC_1E_PROTOCOL_VERSION],
      },
      Uwc1eProductSurface: {
        type: 'string' as const,
        enum: [...UWC_1E_PRODUCT_SURFACES],
      },
      Uwc1eProtocolStage: {
        type: 'string' as const,
        enum: [...UNIFIED_WRITE_PROTOCOL_STAGES],
      },
      Uwc1eFirstBatchSlice: {
        type: 'string' as const,
        enum: [...UWC_1E_FIRST_BATCH_SLICES],
      },
      Uwc1eClientOutcome: {
        type: 'string' as const,
        enum: [...UWC_1E_CLIENT_OUTCOMES],
      },
      Uwc1eSessionState: {
        type: 'string' as const,
        enum: [...UWC_1E_SESSION_STATES],
      },
      Uwc1eApplyPipelineStage: {
        type: 'string' as const,
        enum: [...UWC_1E_APPLY_PIPELINE_STAGES],
      },
      Uwc1eExcludedCapability: {
        type: 'string' as const,
        enum: [...UWC_1E_EXCLUDED_CAPABILITIES],
      },
    },
  },
  'x-uwc-locks': {
    globalOccUnlock: true,
    compensationExec: true,
    corridorAuthoritativeExpansion: false,
  },
  'x-uwc-client-rules': {
    conflictMustRePreview: true,
    verificationRequiredNoBypass: true,
    rejectedNoBypass: true,
    webIosSameContract: true,
  },
} as const;

export type Uwc1eOpenApiFreeze = typeof UWC_1E_OPENAPI_FREEZE;
