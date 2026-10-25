/**
 * Persist / read Proactive Decision V1 surface snapshot on trip.metadata.
 * Mobile BFF reads this; pipelines write after Orchestrator ingest.
 */

import type { ProactiveImpactV1 } from '../contracts/proactive-impact.types';
import type { ProactiveSynthesisV1 } from '../synthesis/proactive-synthesis.types';
import type { ProactiveInterventionDecisionV1 } from '../intervention/evaluate-proactive-intervention.util';
import type { ProactiveChangeDraftV1 } from '../execution/proactive-change-draft.types';
import type { ProactiveErcProjectionItemV1 } from '../erc/project-proactive-to-erc.util';
import type { ProactiveDecisionTraceV1 } from '../trace/proactive-decision-trace.types';
import type { LensActivationDecisionV1 } from '../lenses/lens-activation.types';

export const PROACTIVE_SURFACE_SNAPSHOT_SCHEMA =
  'nara.proactive_decision_surface_snapshot@v1' as const;

export const PROACTIVE_SURFACE_METADATA_KEY = 'proactiveDecisionV1Surface' as const;

export type ProactiveDecisionSurfaceSnapshotV1 = {
  schemaId: typeof PROACTIVE_SURFACE_SNAPSHOT_SCHEMA;
  version: 1;
  tripId: string;
  updatedAt: string;
  impact: ProactiveImpactV1;
  synthesis: ProactiveSynthesisV1 | null;
  intervention: ProactiveInterventionDecisionV1 | null;
  changeDraft: ProactiveChangeDraftV1 | null;
  ercProjection: ProactiveErcProjectionItemV1 | null;
  decisionProblemId: string | null;
  /** Phase 4 P0 — why this suggestion existed (Shadow-visible) */
  decisionTrace: ProactiveDecisionTraceV1 | null;
  lensActivation: LensActivationDecisionV1 | null;
};

export function buildProactiveDecisionSurfaceSnapshot(input: {
  tripId: string;
  impact: ProactiveImpactV1;
  synthesis: ProactiveSynthesisV1 | null;
  intervention: ProactiveInterventionDecisionV1 | null;
  changeDraft: ProactiveChangeDraftV1 | null;
  ercProjection: ProactiveErcProjectionItemV1 | null;
  decisionProblemId?: string | null;
  decisionTrace?: ProactiveDecisionTraceV1 | null;
  lensActivation?: LensActivationDecisionV1 | null;
  updatedAt?: string;
}): ProactiveDecisionSurfaceSnapshotV1 {
  return {
    schemaId: PROACTIVE_SURFACE_SNAPSHOT_SCHEMA,
    version: 1,
    tripId: input.tripId,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
    impact: input.impact,
    synthesis: input.synthesis,
    intervention: input.intervention,
    changeDraft: input.changeDraft,
    ercProjection: input.ercProjection,
    decisionProblemId:
      input.decisionProblemId ??
      input.changeDraft?.decisionProblemId ??
      null,
    decisionTrace: input.decisionTrace ?? null,
    lensActivation: input.lensActivation ?? null,
  };
}

export function readProactiveDecisionSurfaceSnapshot(
  metadata: unknown,
): ProactiveDecisionSurfaceSnapshotV1 | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = (metadata as Record<string, unknown>)[PROACTIVE_SURFACE_METADATA_KEY];
  if (!raw || typeof raw !== 'object') return null;
  const snap = raw as ProactiveDecisionSurfaceSnapshotV1;
  if (snap.schemaId !== PROACTIVE_SURFACE_SNAPSHOT_SCHEMA) return null;
  if (snap.version !== 1) return null;
  return snap;
}

export function mergeProactiveDecisionSurfaceIntoMetadata(
  metadata: unknown,
  snapshot: ProactiveDecisionSurfaceSnapshotV1,
): Record<string, unknown> {
  const base =
    metadata && typeof metadata === 'object'
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  base[PROACTIVE_SURFACE_METADATA_KEY] = snapshot;
  return base;
}
