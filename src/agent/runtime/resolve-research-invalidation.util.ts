import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { DecisionOsExecutionContext } from './decision-os-execution-context';
import { computeIncrementalResearchScopes } from './compute-incremental-research-scopes.util';
import type { IncrementalResearchScope } from './compute-incremental-research-scopes.util';
import { extractNluResearchInvalidateScopes } from '../utils/intake-research-scope-signals.util';
import {
  dedupeResearchScopes,
  type ResearchAssetScope,
} from '../utils/research-asset-scope.util';

const ALL_ASSET_SCOPES_EX_COMMON: readonly ResearchAssetScope[] = [
  'hotel',
  'flight',
  'destination',
  'transport',
  'compliance',
];

/** IncrementalResearchDomain → 现有 research_data 域（扁平键启发式兼容层） */
const INCREMENTAL_DOMAIN_TO_ASSET_SCOPE: Record<
  IncrementalResearchScope['domain'],
  ResearchAssetScope | ResearchAssetScope[]
> = {
  hotel: 'hotel',
  flight: 'flight',
  poi: 'destination',
  transit: 'transport',
  global: [...ALL_ASSET_SCOPES_EX_COMMON],
};

export type ResearchInvalidationSource = 'dos_incremental' | 'legacy_nlu' | 'none';

export type ResearchInvalidationResolution = {
  assetScopes: ResearchAssetScope[];
  incrementalScopes: IncrementalResearchScope[];
  source: ResearchInvalidationSource;
};

/**
 * 将 Fiber 级增量作用域映射为现有 Research 引擎可消费的 `ResearchAssetScope[]`。
 */
export function mapIncrementalScopesToAssetScopes(
  incremental: IncrementalResearchScope[],
): ResearchAssetScope[] {
  const out: ResearchAssetScope[] = [];
  for (const scope of incremental) {
    const mapped = INCREMENTAL_DOMAIN_TO_ASSET_SCOPE[scope.domain];
    if (Array.isArray(mapped)) {
      out.push(...mapped);
    } else {
      out.push(mapped);
    }
  }
  return dedupeResearchScopes(out);
}

/**
 * DOS 优先、legacy NLU 降级的研究失效解析（编排层唯一入口）。
 */
export function resolveResearchInvalidation(
  request: RouteAndRunRequestDto,
  dosContext?: DecisionOsExecutionContext | null,
): ResearchInvalidationResolution {
  if (dosContext && dosContext.planDelta.length > 0) {
    const incrementalScopes = computeIncrementalResearchScopes(dosContext);
    if (incrementalScopes.length > 0) {
      return {
        assetScopes: mapIncrementalScopesToAssetScopes(incrementalScopes),
        incrementalScopes,
        source: 'dos_incremental',
      };
    }
  }

  const legacy = extractNluResearchInvalidateScopes(request);
  if (legacy.length > 0) {
    return {
      assetScopes: legacy,
      incrementalScopes: [],
      source: 'legacy_nlu',
    };
  }

  return {
    assetScopes: [],
    incrementalScopes: [],
    source: 'none',
  };
}
