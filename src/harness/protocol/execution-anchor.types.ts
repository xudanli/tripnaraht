/**
 * RFC-003 §9.4 — Harness execution anchor (Revision-bound run metadata).
 */

import type { TravelContextDomain } from '../../travel-context/domain/travel-context.constants';

export type HarnessRuntimeAuthority = 'CANONICAL' | 'LEGACY' | 'SHADOW';

export interface HarnessExecutionAnchor {
  contextId: string;
  inputSnapshotId: string;
  inputRevision: number;
  effectivePlanVersion?: string;
  worldStateVersion: string;
  constraintVersion: string;
  runtimeAuthority: HarnessRuntimeAuthority;
  outputSnapshotId?: string;
  outputRevision?: number;
  authorityRunId?: string;
  changedDomains?: TravelContextDomain[];
}

export interface ContextAuthorityTrace {
  authorityRunId: string;
  inputContext: { snapshotId: string; revision: number };
  authority: {
    runtime: HarnessRuntimeAuthority;
    gateway: string;
    policyVersion: string;
  };
  outputContext?: { snapshotId: string; revision: number };
  changedDomains: string[];
}
