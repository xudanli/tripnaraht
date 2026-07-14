/** Auditable planning release sign-off bundle (M4). */

export type PlanningSignoffStatus = 'PASS' | 'WAIT' | 'FAIL' | 'READY';

export type PlanningSignoffKind =
  | 'stability'
  | 'locality'
  | 'gateway'
  | 'rollback'
  | 'authority';

export interface PlanningSignoffArtifact {
  schemaId: string;
  kind: PlanningSignoffKind;
  status: PlanningSignoffStatus;
  /** Counts toward gate PASS only when true and status is PASS|READY(as defined per kind) */
  approved: boolean;
  approvedAt?: string;
  approvedBy?: string;
  evidenceRef?: string;
  detail?: string;
  criteria?: Record<string, unknown>;
  summary?: string;
}

export interface PlanningSignoffManifest {
  schemaId: 'tripnara.planning_signoff.bundle@v1';
  bundleId: string;
  date: string;
  generatedAt: string;
  artifacts: PlanningSignoffKind[];
  notes?: string;
}

export interface PlanningSignoffBundle {
  root: string;
  date: string;
  manifest: PlanningSignoffManifest;
  stability?: PlanningSignoffArtifact;
  locality?: PlanningSignoffArtifact;
  gateway?: PlanningSignoffArtifact;
  rollback?: PlanningSignoffArtifact;
  authority?: PlanningSignoffArtifact;
}
