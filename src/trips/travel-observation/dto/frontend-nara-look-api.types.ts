/**
 * NARA Look · frontend / iOS reference types (S1 Capture + S5 Result)
 * Mirror of observation.types.ts — copy into iOS codegen or Swift models.
 *
 * Result / Evidence / Preview models: `frontend-nara-look-result.ts`
 */

export type NaraLookObservationChannel = 'LOOK_FIELD';

export type NaraLookIntent =
  | 'CHECK_VEHICLE'
  | 'CHECK_ROAD'
  | 'CHECK_ACTIVITY_ENTRY'
  | 'CHECK_PARKING'
  | 'CHECK_RENTAL_HANDOVER';

export type NaraLookSource = 'IPHONE_CAMERA' | 'PHOTO_LIBRARY';

export type NaraLookPipelineStatus =
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

export type NaraLookProgressStage =
  | 'UPLOADING_MEDIA'
  | 'EXTRACTING_SCENE'
  | 'MATCHING_LOCATION'
  | 'CHECKING_VEHICLE_ROAD_FIT'
  | 'CHECKING_TRIP_IMPACT'
  | 'FINALIZING';

export type NaraLookAssessmentStatus =
  | 'INFO'
  | 'NOTICE'
  | 'NEED_CONFIRM'
  | 'SUGGEST_REPLACE'
  | 'EXECUTION_BLOCK'
  | 'UNKNOWN';

export type NaraLookAction =
  | { type: 'NAVIGATION'; routeRef: string; label: string }
  | { type: 'PREVIEW'; previewRef: string; label: string }
  | { type: 'ACKNOWLEDGE'; label: string }
  | { type: 'RECAPTURE'; captureInstruction: string; label: string };

export type NaraLookTripRole = 'ORGANIZER' | 'DRIVER' | 'MEMBER' | 'ADVISOR';

export interface NaraLookGeoPoint {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
}

export interface NaraLookCreateRequest {
  intent: NaraLookIntent;
  dayIndex?: number;
  capturedAt: string;
  location?: NaraLookGeoPoint;
  heading?: number;
  mediaRefs: string[];
  question?: string;
  source?: NaraLookSource;
  tripEndAt?: string;
}

export interface NaraLookCreateResponse {
  observationId: string;
  status: NaraLookPipelineStatus;
  captureRevision: number;
}

export interface NaraLookStatusResponse {
  observationId: string;
  status: NaraLookPipelineStatus;
  progress?: { stage: NaraLookProgressStage };
  verificationStatus?: string;
  captureRevision: number;
  channel: NaraLookObservationChannel;
}

export interface NaraLookAssessment {
  assessmentId: string;
  observationId: string;
  assessmentRevision: number;
  summary: {
    whatHappened: string;
    impact: string;
    recommendation: string;
  };
  status: NaraLookAssessmentStatus;
  evidenceIds: string[];
  actions: NaraLookAction[];
  verificationStatus: string;
  writesPlanVersion: false;
  authority?:
    | 'VISUAL_ONLY'
    | 'CONTEXT_GROUNDED'
    | 'OFFICIAL_CORROBORATED'
    | 'USER_CONFIRMED'
    | 'PROFESSIONAL_CONFIRMED';
  contextHash?: string;
  decisionProblem?: {
    type: string;
    semanticKey: string;
    linkedDecisionProblemId?: string;
  };
  dataFreshness?: {
    assessedAt: string;
    roadStatusUpdatedAt?: string;
    weatherUpdatedAt?: string;
  };
}

export interface NaraLookAssessmentNotReady {
  code: 'OBSERVATION_ASSESSMENT_NOT_READY';
  observationId: string;
  status: NaraLookPipelineStatus;
  progress: { stage: NaraLookProgressStage };
  retryAfterMs: number;
}

export interface NaraLookAppendMediaRequest {
  mediaRefs: string[];
  capturedAt?: string;
  location?: NaraLookGeoPoint;
  heading?: number;
  reason: 'SYSTEM_RECAPTURE_REQUEST' | 'USER_ADDED_VIEW';
}

export interface NaraLookPatchContextRequest {
  dayIndex?: number;
  location?: NaraLookGeoPoint;
  heading?: number;
  confirmedIntent?: NaraLookIntent;
  tripContext?: {
    vehicleId?: string;
    currentActivityId?: string;
    nextActivityId?: string;
    bookingId?: string;
  };
  reassess?: boolean;
}

export interface NaraLookPatchContextResult {
  observationId: string;
  status: NaraLookPipelineStatus;
  captureRevision: number;
  contextHash?: string;
  assessmentRevision?: number;
  reassessed: boolean;
  analyticsEvent?: 'look_context_corrected';
  writesPlanVersion: false;
}

export type NaraLookFeedbackResult =
  | 'HELPFUL'
  | 'NOT_HELPFUL'
  | 'WRONG'
  | 'UNCLEAR';

export interface NaraLookFeedbackRequest {
  assessmentId: string;
  assessmentRevision?: number;
  result: NaraLookFeedbackResult;
  userCorrection?: {
    actualKind?: string;
    actualOutcome?: string;
    note?: string;
  };
}

export interface NaraLookFeedbackReceipt {
  feedbackId: string;
  observationId: string;
  assessmentId: string;
  assessmentRevision?: number;
  result: NaraLookFeedbackResult;
  submittedAt: string;
  writesPlanVersion: false;
  analyticsEvent: 'look_feedback_submitted';
}

export interface NaraLookDeletionReceipt {
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

/** Capture Mock screen states (SwiftUI should mirror) */
export type NaraLookCaptureScreen =
  | 'SCENE_SELECT'
  | 'CAMERA'
  | 'CONFIRM'
  | 'ANALYZING'
  | 'RESULT'
  | 'RECAPTURE_SHEET'
  | 'EVIDENCE_SHEET'
  | 'DRIVING_BLOCK'
  | 'PERMISSION_CAMERA'
  | 'PERMISSION_LOCATION';
