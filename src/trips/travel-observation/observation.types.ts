/**
 * NARA Look P0 / S1 — frozen domain types.
 * Source: evidence/work-packages/NARA-LOOK-P0/s0-contracts/*
 * Open Questions CLOSED 2026-07-25 — do not drift without RFC.
 */

/** Q1 — fact acquisition channel; NOT UnifiedAssessmentLaneKind */
export type ObservationChannel = 'LOOK_FIELD';

export type ObservationSource = 'IPHONE_CAMERA' | 'PHOTO_LIBRARY';

export type ObservationIntent =
  | 'CHECK_VEHICLE'
  | 'CHECK_ROAD'
  | 'CHECK_ACTIVITY_ENTRY'
  /** RealityOS P0-A parking rule judgment */
  | 'CHECK_PARKING'
  /** RealityOS P0-B rental pickup/return evidence package */
  | 'CHECK_RENTAL_HANDOVER';

export type VerificationStatus =
  | 'UNVERIFIED'
  | 'CORROBORATED'
  | 'CONFLICTING'
  | 'VERIFIED'
  | 'INSUFFICIENT';

export type ObservationFactSource = 'VISION' | 'OCR' | 'ON_DEVICE';

/** Q3 — Look-local; does not extend VehicleProfile. No AWD in P0. */
export type LookDrivetrain = '2WD' | '4WD' | 'UNKNOWN';

export type ObservationPipelineStatus =
  | 'DRAFT'
  | 'UPLOADING'
  | 'EXTRACTING'
  | 'MEDIA_APPENDED'
  | 'GROUNDING'
  | 'ASSESSING'
  | 'COMPLETED'
  | 'UPLOAD_FAILED'
  | 'IMAGE_INVALID'
  | 'CONTEXT_MISSING'
  | 'MODEL_FAILED'
  | 'ASSESSMENT_FAILED'
  | 'CANCELLED';

export type ObservationProgressStage =
  | 'UPLOADING_MEDIA'
  | 'EXTRACTING_SCENE'
  | 'MATCHING_LOCATION'
  | 'CHECKING_VEHICLE_ROAD_FIT'
  | 'CHECKING_TRIP_IMPACT'
  | 'FINALIZING';

export type AssessmentStatus =
  | 'INFO'
  | 'NOTICE'
  | 'NEED_CONFIRM'
  | 'SUGGEST_REPLACE'
  | 'EXECUTION_BLOCK'
  | 'UNKNOWN';

export type DecisionProblemKind =
  | 'INFEASIBILITY'
  | 'RISK'
  | 'EXECUTION_DEVIATION'
  | 'DATA_UNCERTAINTY';

/** RealityOS §10.4 */
export type AssessmentAuthority =
  | 'VISUAL_ONLY'
  | 'CONTEXT_GROUNDED'
  | 'OFFICIAL_CORROBORATED'
  | 'USER_CONFIRMED'
  | 'PROFESSIONAL_CONFIRMED';

/** Q2 — no APPLY / EXECUTE / UPDATE_PLAN */
export type ObservationAction =
  | { type: 'NAVIGATION'; routeRef: string; label: string }
  | { type: 'PREVIEW'; previewRef: string; label: string }
  | { type: 'ACKNOWLEDGE'; label: string }
  | { type: 'RECAPTURE'; captureInstruction: string; label: string };

export type CaptureRevisionReason =
  | 'SYSTEM_RECAPTURE_REQUEST'
  | 'USER_ADDED_VIEW';

export interface ObservationCaptureRevision {
  observationId: string;
  captureRevision: number;
  mediaRefs: string[];
  addedAt: string;
  reason: CaptureRevisionReason;
}

export interface GeoPoint {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
}

export interface ObservationSpatialContext {
  latitude?: number;
  longitude?: number;
  altitude?: number;
  heading?: number;
  accuracyMeters?: number;
  routeSegmentId?: string;
}

export interface ObservationTripContext {
  vehicleId?: string;
  currentActivityId?: string;
  nextActivityId?: string;
  bookingId?: string;
}

export interface ObservationFact {
  semanticType: string;
  semanticKey: string;
  value: unknown;
  confidence: number;
  source: ObservationFactSource;
}

export interface ObservationPrivacy {
  containsFace: boolean;
  containsPlate: boolean;
  containsDocument: boolean;
  redactionApplied: boolean;
  retentionPolicy: 'LOOK_MEDIA_SHORT_TERM_V1';
}

export interface TravelObservationEvent {
  observationId: string;
  tripId: string;
  dayIndex?: number;
  channel: ObservationChannel;
  source: ObservationSource;
  intent: ObservationIntent;
  capturedAt: string;
  submittedAt: string;
  mediaRefs: string[];
  captureRevision: number;
  captureRevisions: ObservationCaptureRevision[];
  latestAssessmentRevision?: number;
  spatialContext: ObservationSpatialContext;
  tripContext: ObservationTripContext;
  observations: ObservationFact[];
  verificationStatus: VerificationStatus;
  privacy: ObservationPrivacy;
  status: ObservationPipelineStatus;
  progressStage?: ObservationProgressStage;
  userQuestion?: string;
  /** Soft-delete / revoke flag */
  deletedAt?: string;
  /** S2 extraction meta for recapture UI */
  extractionMeta?: {
    providerId: string;
    sceneType: string;
    requiredAdditionalViews: string[];
    uncertainties: string[];
  };
}

export interface ObservationContext {
  trip: {
    tripId: string;
    phase: 'TRAVELING';
    dayIndex: number;
  };
  spatial: {
    location?: GeoPoint;
    heading?: number;
    nearbyRoadIds: string[];
    nearbyPoiIds: string[];
  };
  temporal: {
    localTime: string;
    capturedAt: string;
  };
  vehicle?: {
    vehicleId: string;
    vehicleClass: string;
    drivetrain: LookDrivetrain;
  };
  execution: {
    currentActivityId?: string;
    nextActivityId?: string;
    destinationId?: string;
    bookingId?: string;
  };
  externalEvidence: {
    weatherSnapshotId?: string;
    roadStatusSnapshotId?: string;
    roadStatusUpdatedAt?: string;
  };
}

export interface ObservationAssessment {
  assessmentId: string;
  observationId: string;
  assessmentRevision: number;
  summary: {
    whatHappened: string;
    impact: string;
    recommendation: string;
  };
  status: AssessmentStatus;
  decisionProblem?: {
    type: DecisionProblemKind;
    semanticKey: string;
    linkedDecisionProblemId?: string;
  };
  evidenceIds: string[];
  actions: ObservationAction[];
  dataFreshness?: {
    roadStatusUpdatedAt?: string;
    weatherUpdatedAt?: string;
    assessedAt: string;
  };
  verificationStatus: VerificationStatus;
  /** Look invariant — always false */
  writesPlanVersion: false;
  /**
   * RealityOS §10.4 — what the conclusion may be used for.
   * VISUAL_ONLY must not alone justify high-risk “allowed to continue”.
   */
  authority: AssessmentAuthority;
  /** GRD-FR-008 — hash of grounding context at assessment time */
  contextHash: string;
}

export interface CreateObservationInput {
  intent: ObservationIntent;
  dayIndex?: number;
  capturedAt: string;
  location?: GeoPoint;
  heading?: number;
  mediaRefs: string[];
  question?: string;
  source?: ObservationSource;
  tripContext?: ObservationTripContext;
  /** Optional trip end for retention clock */
  tripEndAt?: string;
  /**
   * S2: OCR / multimodal seed text for heuristic extractor (tests + offline).
   * Production image OCR providers ignore this when real bytes exist.
   */
  ocrTextSeed?: string;
  /** S3: trip/vehicle/road/booking hints until live providers wired */
  groundingHints?: import('./grounding/grounding.types').GroundingHints;
}

export interface AppendMediaInput {
  mediaRefs: string[];
  capturedAt?: string;
  location?: GeoPoint;
  heading?: number;
  reason: CaptureRevisionReason;
  ocrTextSeed?: string;
  groundingHints?: import('./grounding/grounding.types').GroundingHints;
}

/** RealityOS §16.5 — patch trip/day/vehicle/booking/location/confirmed scene */
export interface PatchObservationContextInput {
  dayIndex?: number;
  location?: GeoPoint;
  heading?: number;
  /** User-confirmed scene type (may update intent + reassess) */
  confirmedIntent?: ObservationIntent;
  tripContext?: ObservationTripContext;
  groundingHints?: import('./grounding/grounding.types').GroundingHints;
  /**
   * When true (default if observation already COMPLETED / recoverable fail),
   * re-run extract → ground → assess. Never writes PlanVersion.
   */
  reassess?: boolean;
}

export type LookFeedbackResult =
  | 'HELPFUL'
  | 'NOT_HELPFUL'
  | 'WRONG'
  | 'UNCLEAR';

/** RealityOS §16.7 */
export interface SubmitLookFeedbackInput {
  assessmentId: string;
  assessmentRevision?: number;
  result: LookFeedbackResult;
  userCorrection?: {
    actualKind?: string;
    actualOutcome?: string;
    note?: string;
  };
}

export interface LookFeedbackReceipt {
  feedbackId: string;
  observationId: string;
  assessmentId: string;
  assessmentRevision?: number;
  result: LookFeedbackResult;
  submittedAt: string;
  /** Look invariant */
  writesPlanVersion: false;
  analyticsEvent: 'look_feedback_submitted';
}

export interface PatchContextResult {
  observationId: string;
  status: ObservationPipelineStatus;
  captureRevision: number;
  contextHash?: string;
  assessmentRevision?: number;
  reassessed: boolean;
  analyticsEvent?: 'look_context_corrected';
  writesPlanVersion: false;
}

export interface ObservationDeletionReceipt {
  observationId: string;
  deleted: {
    originalMedia: boolean;
    thumbnails: boolean;
    accessRevoked: boolean;
  };
  retained: {
    structuredObservation: boolean;
    assessmentSummaries: boolean;
    ledgerRefs: boolean;
  };
  mediaRetentionPolicy: 'LOOK_MEDIA_SHORT_TERM_V1';
  deletedAt: string;
}

export interface AssessmentNotReadyBody {
  code: 'OBSERVATION_ASSESSMENT_NOT_READY';
  observationId: string;
  status: ObservationPipelineStatus;
  progress: { stage: ObservationProgressStage };
  retryAfterMs: number;
}

export interface ObservationTerminalFailureBody {
  code: string;
  status: ObservationPipelineStatus;
  recoverable: boolean;
  action?: string;
}

/** Recapture → new id boundary (Q7) — S1 keeps fields for callers */
export interface RecaptureBoundaryInput {
  distanceFromOriginalMeters?: number;
  timeSinceOriginalMs?: number;
  routeSegmentIdChanged?: boolean;
  intentChanged?: boolean;
}

export const RECAPTURE_NEW_ID_DISTANCE_M = 250;
export const RECAPTURE_NEW_ID_TIME_MS = 30 * 60 * 1000;
