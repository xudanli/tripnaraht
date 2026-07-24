import type { CollaborativeFlywheelAuditReport } from './collaborative-flywheel-replay-audit.util';
import type { CollaborativeFlywheelObservationExport } from './collaborative-flywheel-replay-audit.util';

export const COLLAB_FLYWHEEL_OUTCOME_SCHEMA = 'collab-flywheel-outcome/v1' as const;

export type CollabFlywheelOutcomePayloadV1 = {
  schema: typeof COLLAB_FLYWHEEL_OUTCOME_SCHEMA;
  recordedAtIso: string;
  observation: CollaborativeFlywheelObservationExport;
  audit: CollaborativeFlywheelAuditReport;
  abuNarrative?: string | null;
  dispatchedMitigatingTemplateIds?: string[];
};

export type CollabFlywheelReplayCompareResult = {
  snapshotId: string;
  applicationId: string;
  tripId: string | null;
  predictionFingerprint: string;
  comparablePredictionFp: string;
  comparableObservationFp: string | null;
  auditMatch: boolean | null;
  note?: string;
};
