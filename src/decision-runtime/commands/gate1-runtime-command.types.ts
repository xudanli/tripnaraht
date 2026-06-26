import type {
  ConflictFeedbackDto,
  ConflictFindingActionDto,
  ConsentDto,
  PublishOutputDto,
  ReadinessFeedbackDto,
  ReadinessFindingActionDto,
  ReviewSanitizedConstraintDto,
  SavePreferencesDto,
  SubmitAdvisorDecisionDto,
  SubmitProjectOutcomeDto,
  UpsertReadinessReportDto,
} from '../../gate1/dto/gate1.dto';

export enum Gate1RuntimeCommandType {
  RECORD_DECISION = 'RECORD_DECISION',
  PUBLISH_CONFLICT = 'PUBLISH_CONFLICT',
  PUBLISH_CANDIDATE = 'PUBLISH_CANDIDATE',
  PUBLISH_PLAN_B = 'PUBLISH_PLAN_B',
  PUBLISH_READINESS = 'PUBLISH_READINESS',
  RECORD_OUTCOME = 'RECORD_OUTCOME',
  RECORD_PARTICIPANT_CONSENT = 'RECORD_PARTICIPANT_CONSENT',
  SAVE_PARTICIPANT_PREFERENCES = 'SAVE_PARTICIPANT_PREFERENCES',
  REVIEW_SANITIZED_CONSTRAINT = 'REVIEW_SANITIZED_CONSTRAINT',
  RECORD_CONFLICT_FEEDBACK = 'RECORD_CONFLICT_FEEDBACK',
  RECORD_CONFLICT_ACTION = 'RECORD_CONFLICT_ACTION',
  UPSERT_READINESS_DRAFT = 'UPSERT_READINESS_DRAFT',
  RECORD_READINESS_FEEDBACK = 'RECORD_READINESS_FEEDBACK',
  RECORD_READINESS_ACTION = 'RECORD_READINESS_ACTION',
}

export type Gate1RuntimeCommand =
  | {
      type: Gate1RuntimeCommandType.RECORD_DECISION;
      projectId: string;
      actorId: string;
      dto: SubmitAdvisorDecisionDto;
    }
  | {
      type: Gate1RuntimeCommandType.PUBLISH_CONFLICT;
      projectId: string;
      version: number;
      actorId: string;
      dto: PublishOutputDto;
    }
  | {
      type: Gate1RuntimeCommandType.PUBLISH_CANDIDATE;
      projectId: string;
      candidateId: string;
      actorId: string;
      dto: PublishOutputDto;
    }
  | {
      type: Gate1RuntimeCommandType.PUBLISH_PLAN_B;
      projectId: string;
      planBId: string;
      actorId: string;
      dto: PublishOutputDto;
    }
  | {
      type: Gate1RuntimeCommandType.PUBLISH_READINESS;
      projectId: string;
      version: number;
      actorId: string;
      dto: PublishOutputDto;
    }
  | {
      type: Gate1RuntimeCommandType.RECORD_OUTCOME;
      projectId: string;
      actorId: string;
      dto: SubmitProjectOutcomeDto;
    }
  | {
      type: Gate1RuntimeCommandType.RECORD_PARTICIPANT_CONSENT;
      inviteToken: string;
      dto: ConsentDto;
    }
  | {
      type: Gate1RuntimeCommandType.SAVE_PARTICIPANT_PREFERENCES;
      inviteToken: string;
      dto: SavePreferencesDto;
    }
  | {
      type: Gate1RuntimeCommandType.REVIEW_SANITIZED_CONSTRAINT;
      projectId: string;
      constraintId: string;
      actorId: string;
      dto: ReviewSanitizedConstraintDto;
    }
  | {
      type: Gate1RuntimeCommandType.RECORD_CONFLICT_FEEDBACK;
      findingId: string;
      actorId: string;
      dto: ConflictFeedbackDto;
    }
  | {
      type: Gate1RuntimeCommandType.RECORD_CONFLICT_ACTION;
      findingId: string;
      actorId: string;
      dto: ConflictFindingActionDto;
    }
  | {
      type: Gate1RuntimeCommandType.UPSERT_READINESS_DRAFT;
      projectId: string;
      actorId: string;
      dto: UpsertReadinessReportDto;
    }
  | {
      type: Gate1RuntimeCommandType.RECORD_READINESS_FEEDBACK;
      findingId: string;
      actorId: string;
      dto: ReadinessFeedbackDto;
    }
  | {
      type: Gate1RuntimeCommandType.RECORD_READINESS_ACTION;
      findingId: string;
      actorId: string;
      dto: ReadinessFindingActionDto;
    };

export interface Gate1RuntimeCommandMeta {
  commandType: Gate1RuntimeCommandType;
  executedAt: string;
}
