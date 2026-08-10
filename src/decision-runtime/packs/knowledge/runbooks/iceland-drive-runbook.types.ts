/**
 * Iceland Self-Drive Exception Runbook contracts (WP3).
 * Declarative procedure + fixed executor — not a BPMN engine.
 */

import type { SourceReference } from '../iceland-knowledge.types';

export type IcelandDriveRunbookId =
  | 'IS_RB_ROAD_CLOSURE'
  | 'IS_RB_STRONG_WIND'
  | 'IS_RB_FUEL_INSUFFICIENT'
  | 'IS_RB_BOOKING_ETA_MISS';

export type IcelandDriveRunbookCandidateOp =
  | 'SHIFT'
  | 'SHORTEN'
  | 'SWAP'
  | 'REROUTE'
  | 'REMOVE'
  | 'ADD_STOP'
  | 'END_DAY_EARLY';

export type IcelandDriveConfirmationPolicy =
  | 'NO_CONFIRM'
  | 'ACKNOWLEDGE'
  | 'USER_CONFIRM'
  | 'SAFE_STOP_REQUIRED';

export interface IcelandDriveRunbookAction {
  code: string;
  description: string;
}

export interface IcelandDriveRunbook {
  runbookId: IcelandDriveRunbookId;
  scenarioType: string;
  version: string;
  trigger: {
    eventTypes: string[];
    conditions: Array<{
      field: string;
      operator: string;
      value?: string | number | boolean;
    }>;
  };
  preconditions: string[];
  immediateSafetyActions: IcelandDriveRunbookAction[];
  prohibitedActions: IcelandDriveRunbookAction[];
  contextRequired: string[];
  tools: Array<{ toolId: string; purpose: string }>;
  impactAnalysis: {
    affectedEntities: string[];
    temporalPropagation: boolean;
  };
  candidateOperations: IcelandDriveRunbookCandidateOp[];
  confirmationPolicy: IcelandDriveConfirmationPolicy;
  verificationRequired: string[];
  apply: {
    commandType: string;
    createPlanVersion: boolean;
    ledgerRequired: boolean;
  };
  fallback: Array<{ when: string; action: string }>;
  evidence: SourceReference[];
}

export interface IcelandDriveRunbookRegistryEntry {
  runbookId: IcelandDriveRunbookId;
  path: string;
  status: 'ACTIVE' | 'DRAFT' | 'DEPRECATED';
  domain: string;
}

export interface IcelandDriveRunbookRegistry {
  schemaId: 'tripnara.iceland.drive_runbook_registry@v1';
  version: string;
  status: 'ACTIVE' | 'DRAFT';
  runbooks: IcelandDriveRunbookRegistryEntry[];
  deferredRunbookIds: string[];
}

/** Runtime facts supplied by monitoring / repair callers. */
export interface IcelandDriveRunbookContext {
  eventType: string;
  userSafeStopped?: boolean;
  /** Closed / limited road segment id when applicable. */
  roadSegmentId?: string;
  roadStatus?: 'CLOSED' | 'LIMITED' | 'OPEN' | 'UNKNOWN';
  /** Safe pull-off / parking poi. */
  safeStopPoiId?: string;
  /** Optional traveler position for nearest safe-stop resolve. */
  lat?: number;
  lng?: number;
  /** Wind / exposure. */
  windGustMs?: number;
  vehicleClass?: string;
  roadExposure?: 'LOW' | 'MEDIUM' | 'HIGH';
  estimatedDelayMinRange?: [number, number];
  /** Booking / accommodation ETA. */
  bookingId?: string;
  bookingWindowEnd?: string;
  etaMinutesLate?: number;
  shortenableSlotIds?: string[];
  /** Fuel bridge — optional opaque payload. */
  fuelAssessmentStatus?: 'PASS' | 'WARN' | 'BLOCK';
  fuelPrimaryStation?: string;
  fuelFallbackStation?: string;
  fuelRecommendedAction?: string;
  /** Explicit candidate ops override (tests). */
  proposedOperations?: IcelandDriveRunbookCandidateOp[];
  /** Extra notes for proposal summary. */
  notes?: string[];
}

export interface IcelandDriveRunbookExecutionResult {
  runbookId: IcelandDriveRunbookId;
  scenarioType: string;
  stepsCompleted: string[];
  immediateSafetyActions: string[];
  prohibitedActions: string[];
  candidateOperations: IcelandDriveRunbookCandidateOp[];
  confirmationPolicy: IcelandDriveConfirmationPolicy;
  createPlanVersion: boolean;
  ledgerRequired: boolean;
  commandType: string;
  verifiedProposal: boolean;
  proposalSummary: string;
  fallbackApplied?: { when: string; action: string };
  contextEcho: Partial<IcelandDriveRunbookContext>;
  evidence: SourceReference[];
}
