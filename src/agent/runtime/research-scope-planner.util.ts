/**
 * Research Scope Planner — 统一研究作用域决策（R2R / DOS / NLU / options）。
 * Schema: tripnara.research_scope_plan@v1
 */

import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { DecisionOsExecutionContext } from './decision-os-execution-context';
import {
  resolveResearchInvalidation,
  type ResearchInvalidationSource,
} from './resolve-research-invalidation.util';
import {
  dedupeResearchScopes,
  isResearchAssetScope,
  type ResearchAssetScope,
} from '../utils/research-asset-scope.util';
import {
  buildReturnToResearchContextV1,
  type ReturnToResearchContextV1,
} from '../orchestration/return-to-research-context.util';

export const RESEARCH_SCOPE_PLAN_SCHEMA_ID = 'tripnara.research_scope_plan@v1' as const;
export const RESEARCH_SCOPE_PLANNER_VERSION = '1.0.0' as const;

/** 优先级：r2r > dos_incremental > options > legacy_nlu */
export type ResearchScopePlanSource =
  | 'r2r'
  | 'dos_incremental'
  | 'options'
  | 'legacy_nlu'
  | 'none';

export interface ResearchScopePlanV1 {
  schemaId: typeof RESEARCH_SCOPE_PLAN_SCHEMA_ID;
  version: 1;
  assetScopes: ResearchAssetScope[];
  source: ResearchScopePlanSource;
  forbid_full_research: boolean;
  attribution: {
    invalidation_source?: ResearchInvalidationSource;
    r2r?: Pick<ReturnToResearchContextV1, 'failure_codes' | 'missing_evidence' | 'scopes'>;
    option_scopes?: ResearchAssetScope[];
  };
  at: string;
}

export function planResearchScopes(input: {
  request: RouteAndRunRequestDto;
  dosContext?: DecisionOsExecutionContext | null;
  metadata?: Record<string, unknown>;
}): ResearchScopePlanV1 {
  const at = new Date().toISOString();
  const meta = input.metadata ?? {};
  const existingR2r = meta.return_to_research_context_v1 as ReturnToResearchContextV1 | undefined;

  if (existingR2r?.schemaId === 'tripnara.return_to_research_context@v1' && existingR2r.scopes?.length) {
    return {
      schemaId: RESEARCH_SCOPE_PLAN_SCHEMA_ID,
      version: 1,
      assetScopes: dedupeResearchScopes(existingR2r.scopes),
      source: 'r2r',
      forbid_full_research: existingR2r.forbid_full_research === true,
      attribution: {
        r2r: {
          failure_codes: existingR2r.failure_codes,
          missing_evidence: existingR2r.missing_evidence,
          scopes: existingR2r.scopes,
        },
      },
      at,
    };
  }

  // 若 harness 失败事件在 metadata 侧、尚未物化为 context，仍可优先 R2R
  const harnessEvents = meta.last_harness_failure_events as
    | Array<{ code?: string; message?: string }>
    | undefined;
  if (Array.isArray(harnessEvents) && harnessEvents.length > 0 && meta.force_r2r_scope_plan === true) {
    const ctx = buildReturnToResearchContextV1({ events: harnessEvents });
    return {
      schemaId: RESEARCH_SCOPE_PLAN_SCHEMA_ID,
      version: 1,
      assetScopes: ctx.scopes,
      source: 'r2r',
      forbid_full_research: true,
      attribution: {
        r2r: {
          failure_codes: ctx.failure_codes,
          missing_evidence: ctx.missing_evidence,
          scopes: ctx.scopes,
        },
      },
      at,
    };
  }

  const optRaw = input.request.options?.research_invalidate_scopes;
  const optionScopes = Array.isArray(optRaw)
    ? dedupeResearchScopes(optRaw.filter(isResearchAssetScope))
    : [];

  const invalidation = resolveResearchInvalidation(input.request, input.dosContext);
  if (invalidation.source === 'dos_incremental' && invalidation.assetScopes.length > 0) {
    const merged = dedupeResearchScopes([...invalidation.assetScopes, ...optionScopes]);
    return {
      schemaId: RESEARCH_SCOPE_PLAN_SCHEMA_ID,
      version: 1,
      assetScopes: merged,
      source: 'dos_incremental',
      forbid_full_research: false,
      attribution: {
        invalidation_source: invalidation.source,
        option_scopes: optionScopes.length ? optionScopes : undefined,
      },
      at,
    };
  }

  if (optionScopes.length > 0) {
    const merged = dedupeResearchScopes([...optionScopes, ...invalidation.assetScopes]);
    return {
      schemaId: RESEARCH_SCOPE_PLAN_SCHEMA_ID,
      version: 1,
      assetScopes: merged,
      source: 'options',
      forbid_full_research: false,
      attribution: {
        invalidation_source: invalidation.source,
        option_scopes: optionScopes,
      },
      at,
    };
  }

  if (invalidation.assetScopes.length > 0) {
    return {
      schemaId: RESEARCH_SCOPE_PLAN_SCHEMA_ID,
      version: 1,
      assetScopes: invalidation.assetScopes,
      source: invalidation.source === 'legacy_nlu' ? 'legacy_nlu' : 'dos_incremental',
      forbid_full_research: false,
      attribution: { invalidation_source: invalidation.source },
      at,
    };
  }

  return {
    schemaId: RESEARCH_SCOPE_PLAN_SCHEMA_ID,
    version: 1,
    assetScopes: [],
    source: 'none',
    forbid_full_research: false,
    attribution: {},
    at,
  };
}
