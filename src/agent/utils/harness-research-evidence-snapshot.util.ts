import type { DecisionState } from '../../decision/kernel/decision-state.types';
import { buildResearchEvidenceSnapshot } from '../../harness/lib/research-evidence-snapshot';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';

/** POI_SELECTION 后或 GATE_EVAL 前：将 research_data 冻结为 Harness 证据快照锚点。 */
export function ensureHarnessResearchEvidenceSnapshot(
  decisionState: DecisionState | undefined,
  requestId: string,
  researchData: Record<string, unknown> | null | undefined,
): DecisionState | undefined {
  if (!decisionState) return decisionState;
  const data =
    researchData && typeof researchData === 'object' && Object.keys(researchData).length > 0
      ? researchData
      : null;
  if (!data) return decisionState;

  const snap = buildResearchEvidenceSnapshot(requestId, data);
  return {
    ...decisionState,
    harnessRuntime: {
      ...decisionState.harnessRuntime,
      researchEvidenceSnapshotId: snap.researchEvidenceSnapshotId,
      evidenceVersion: snap.evidenceVersion,
    },
  };
}

export function persistSelectedPoisToResearchData(
  state: OrchestratorState,
  rawPoiEvidence: unknown,
  scored: unknown[],
): void {
  if (!scored.length) return;
  const base =
    state.research_data && typeof state.research_data === 'object'
      ? ({ ...(state.research_data as Record<string, unknown>) } as Record<string, unknown>)
      : ({} as Record<string, unknown>);

  if (Array.isArray(rawPoiEvidence)) {
    base.poi_evidence = scored;
  } else if (rawPoiEvidence && typeof rawPoiEvidence === 'object') {
    base.poi_evidence = { ...(rawPoiEvidence as Record<string, unknown>), pois: scored };
  } else {
    base.poi_evidence = scored;
  }
  state.research_data = base as OrchestratorState['research_data'];
}
