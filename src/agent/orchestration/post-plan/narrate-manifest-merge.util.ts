import {
  mergeResearchManifestIntoNarration,
  type MergeResearchManifestAudit,
} from '../../utils/narrator-research-manifest-hints.util';
import type { OrchestratorState } from '../../interfaces/trip-plan.interface';

export type { MergeResearchManifestAudit as NarrateManifestMergeAudit };

/**
 * Manifest 深度合并：将 research asset manifest 投影进 narration（不改 planDraft 硬字段）。
 */
export function applyResearchManifestToNarration(
  state: OrchestratorState,
): MergeResearchManifestAudit | undefined {
  if (!state.narration || !state.research_data || typeof state.research_data !== 'object') {
    return undefined;
  }
  const audit: MergeResearchManifestAudit = { collapsed_suture_count: 0 };
  state.narration = mergeResearchManifestIntoNarration(
    state.narration as Parameters<typeof mergeResearchManifestIntoNarration>[0],
    state,
    audit,
  ) as OrchestratorState['narration'];
  return audit;
}
