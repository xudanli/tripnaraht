import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  GATE1_COHORTS,
  GATE1_CONFLICT_BASELINE_STATUSES,
  GATE1_MATERIAL_CHANGE_TYPES,
  GATE1_SOURCE_TYPES,
  GATE1_TRAVEL_EVENT_TYPES,
  GATE1_SECOND_ORDER_INTENTS,
  GATE1_PAYMENT_COMMITMENT_TYPES,
  GATE1_PARTICIPANT_TASK_CATEGORIES,
  GATE1_CHANGE_SEVERITIES,
  GATE1_TASK_PRIORITIES,
} from '../constants/gate1.constants';

export class CreateGate1ProjectDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsIn([...GATE1_COHORTS])
  cohort!: string;

  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @IsOptional()
  @IsString()
  destination?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  participantCount?: number;

  @IsOptional()
  @IsString()
  linkedTripId?: string;

  @IsOptional()
  @IsString()
  projectManagerId?: string;
}

export class SubmitBaselineDto {
  @IsOptional()
  @IsInt()
  participantCount?: number;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsString()
  destination?: string;

  @IsOptional()
  @IsString()
  customerType?: string;

  @IsOptional()
  @IsString()
  budgetRange?: string;

  @IsOptional()
  @IsString()
  currentStage?: string;

  @IsOptional()
  @IsNumber()
  expectedFirstDraftHours?: number;

  @IsOptional()
  @IsNumber()
  expectedTotalHours?: number;

  @IsOptional()
  @IsInt()
  expectedRevisionRounds?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  difficultyLevel?: number;

  @IsOptional()
  knownConstraints?: unknown;

  @IsOptional()
  knownConflicts?: unknown;

  @IsOptional()
  knownRisks?: unknown;

  @IsOptional()
  pendingConfirmations?: unknown;

  @IsIn(['YES', 'NO', 'UNCERTAIN'])
  mightRejectWithoutTripnara!: string;

  @IsOptional()
  @IsString()
  rejectReason?: string;

  @IsOptional()
  @IsInt()
  estimatedGmvCents?: number;

  @IsOptional()
  @IsString()
  originalPlanSummary?: string;

  @IsOptional()
  attachments?: unknown;

  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}

export class CreateInvitationDto {
  @IsString()
  displayName!: string;

  @IsOptional()
  @IsString()
  contactHint?: string;

  @IsOptional()
  @IsInt()
  expiresInDays?: number;
}

export class ConsentDto {
  @IsString()
  inviteToken!: string;

  @IsIn(['ACCEPT', 'DECLINE'])
  action!: 'ACCEPT' | 'DECLINE';

  @IsOptional()
  @IsString()
  declineReason?: string;

  /** Layered consent flags (PRD §6.1); BASE_SERVICE implied true on ACCEPT */
  @IsOptional()
  @IsBoolean()
  humanAssisted?: boolean;

  @IsOptional()
  @IsBoolean()
  research?: boolean;

  @IsOptional()
  @IsBoolean()
  anonymizedCase?: boolean;

  @IsOptional()
  @IsObject()
  consents?: Partial<Record<'BASE_SERVICE' | 'HUMAN_ASSISTED' | 'RESEARCH' | 'ANONYMIZED_CASE', boolean>>;
}

export class SavePreferencesDto {
  @IsObject()
  publicPrefs!: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  privateConstraints?: Array<{
    fieldKey: string;
    value: string;
    authorizationLevel: 'ANALYST_ONLY' | 'SANITIZED_TO_ADVISOR';
    requestHumanContact?: boolean;
  }>;

  @IsOptional()
  @IsBoolean()
  submit?: boolean;
}

export class AssignPrivacyAnalystDto {
  @IsString()
  analystId!: string;

  @IsString()
  startsAt!: string;

  @IsString()
  endsAt!: string;
}

export class CreateSanitizedConstraintDto {
  @IsOptional()
  @IsUUID()
  participantId?: string;

  @IsString()
  explanation!: string;

  @IsOptional()
  @IsString()
  impactSummary?: string;
}

export class ReviewSanitizedConstraintDto {
  @IsIn(['APPROVED', 'REJECTED'])
  reviewStatus!: 'APPROVED' | 'REJECTED';
}

export class ConflictFindingInputDto {
  @IsString()
  conflictType!: string;

  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'BLOCKER'])
  severity!: string;

  @IsIn(['LOW', 'MEDIUM', 'HIGH'])
  confidence!: string;

  @IsString()
  source!: string;

  @IsIn([...GATE1_CONFLICT_BASELINE_STATUSES])
  baselineStatus!: string;

  @IsString()
  title!: string;

  @IsString()
  description!: string;

  @IsOptional()
  evidence?: unknown;

  @IsOptional()
  @IsString()
  resolutionDirection?: string;

  @IsOptional()
  @IsBoolean()
  isBlocker?: boolean;
}

export class UpsertConflictReportDto {
  @IsOptional()
  @IsInt()
  version?: number;

  @IsOptional()
  @IsIn([...GATE1_SOURCE_TYPES])
  sourceType?: string;

  @IsOptional()
  @IsInt()
  humanMinutes?: number;

  @IsArray()
  findings!: ConflictFindingInputDto[];
}

export class PublishOutputDto {
  @IsOptional()
  @IsInt()
  humanMinutes?: number;

  @IsOptional()
  @IsString()
  reviewedBy?: string;
}

export class CreateCandidateDto {
  @IsString()
  label!: string;

  @IsOptional()
  @IsInt()
  version?: number;

  @IsString()
  strategySummary!: string;

  @IsOptional()
  constraintSatisfaction?: unknown;

  @IsOptional()
  tradeoffs?: unknown;

  @IsOptional()
  risks?: unknown;

  @IsOptional()
  @IsString()
  budgetSummary?: string;

  @IsOptional()
  @IsIn([...GATE1_SOURCE_TYPES])
  sourceType?: string;

  @IsOptional()
  @IsInt()
  humanMinutes?: number;
}

export class SubmitAdvisorDecisionDto {
  @IsOptional()
  @IsUUID()
  selectedCandidateId?: string;

  @IsOptional()
  @IsInt()
  conflictReportVersion?: number;

  @IsOptional()
  @IsBoolean()
  adoptedNone?: boolean;

  @IsOptional()
  @IsString()
  modificationSummary?: string;

  @IsOptional()
  reasonCodes?: string[];

  @IsOptional()
  @IsString()
  reasonText?: string;

  @IsBoolean()
  materialChange!: boolean;

  @ValidateIf((o) => o.materialChange === true)
  @IsArray()
  @IsIn([...GATE1_MATERIAL_CHANGE_TYPES], { each: true })
  changeTypes?: string[];

  @ValidateIf((o) => o.materialChange === true)
  @IsString()
  changeEvidence?: string;

  @IsOptional()
  @IsBoolean()
  valuableButNotAdopted?: boolean;

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

export class ConflictFeedbackDto {
  @IsIn(['VALUABLE', 'NOT_VALUABLE', 'KNOWN', 'ERROR', 'NEEDS_DISCUSSION'])
  feedback!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class ConflictFindingActionDto {
  @IsIn(['CONFIRM', 'DISMISS', 'RESOLVE'])
  action!: 'CONFIRM' | 'DISMISS' | 'RESOLVE';

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  resolutionStrategy?: string;
}

export class ListAdvisorProjectsQueryDto {
  @IsOptional()
  @IsIn([...GATE1_COHORTS])
  cohort?: string;

  @IsOptional()
  @IsString()
  experimentStatus?: string;

  @IsOptional()
  @IsString()
  destination?: string;

  @IsOptional()
  @IsIn(['HIGH', 'MEDIUM', 'LOW'])
  riskLevel?: 'HIGH' | 'MEDIUM' | 'LOW';

  @IsOptional()
  @IsIn(['needs_action', 'departure', 'created'])
  sort?: 'needs_action' | 'departure' | 'created';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  departingWithinDays?: number;
}

export class ManualWorkLogDto {
  @IsString()
  taskType!: string;

  @IsString()
  assigneeId!: string;

  @IsOptional()
  @IsString()
  artifactRef?: string;

  @IsOptional()
  @IsInt()
  minutes?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ReadPrivateConstraintDto {
  @IsString()
  reason!: string;
}

export class TransitionProjectDto {
  @IsString()
  status!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class StartCollectingDto {
  @IsOptional()
  @IsInt()
  minSubmitted?: number;
}

export class ReadinessFindingInputDto {
  @IsString()
  dimension!: string;

  @IsIn(['GREEN', 'YELLOW', 'RED'])
  status!: string;

  @IsString()
  title!: string;

  @IsString()
  description!: string;

  @IsOptional()
  evidence?: unknown;

  @IsOptional()
  @IsString()
  responsibleParty?: string;

  @IsOptional()
  @IsString()
  dueAt?: string;

  @IsOptional()
  @IsBoolean()
  isIncremental?: boolean;
}

export class UpsertReadinessReportDto {
  @IsOptional()
  @IsInt()
  version?: number;

  @IsOptional()
  @IsIn([...GATE1_SOURCE_TYPES])
  sourceType?: string;

  @IsOptional()
  @IsInt()
  humanMinutes?: number;

  @IsArray()
  findings!: ReadinessFindingInputDto[];
}

export class ReadinessFeedbackDto {
  @IsIn(['USEFUL', 'KNOWN', 'ERROR', 'NOT_APPLICABLE'])
  feedback!: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsBoolean()
  closeFinding?: boolean;
}

export class CreatePlanBDto {
  @IsString()
  label!: string;

  @IsOptional()
  @IsInt()
  version?: number;

  @IsString()
  riskTitle!: string;

  @IsOptional()
  @IsString()
  riskDescription?: string;

  @IsString()
  triggerCondition!: string;

  @IsOptional()
  @IsString()
  latestDecisionAt?: string;

  @IsString()
  alternativeSummary!: string;

  @IsOptional()
  @IsString()
  costSummary?: string;

  @IsOptional()
  @IsString()
  impactSummary?: string;

  @IsOptional()
  @IsIn([...GATE1_SOURCE_TYPES])
  sourceType?: string;

  @IsOptional()
  @IsInt()
  humanMinutes?: number;
}

export class AdvisorPlanBPreDecisionDto {
  @IsIn(['ACCEPTED', 'REJECTED', 'PENDING'])
  decision!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class RecordPlanBOutcomeDto {
  @IsBoolean()
  triggered!: boolean;

  @IsOptional()
  @IsBoolean()
  adopted?: boolean;

  @IsOptional()
  @IsString()
  outcomeSummary?: string;
}

export class CreateTravelEventDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn([...GATE1_TRAVEL_EVENT_TYPES])
  eventType?: string;

  @IsString()
  occurredAt!: string;

  @IsOptional()
  @IsString()
  handler?: string;

  @IsOptional()
  @IsString()
  result?: string;

  @IsOptional()
  @IsString()
  responsibleParty?: string;

  @IsOptional()
  @IsUUID()
  planBId?: string;
}

export class SubmitProjectOutcomeDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  valueRating?: number;

  @IsOptional()
  @IsString()
  valueNotes?: string;

  @IsOptional()
  @IsIn([...GATE1_SECOND_ORDER_INTENTS])
  secondOrderIntent?: string;

  @IsOptional()
  @IsBoolean()
  secondOrderProvided?: boolean;

  @IsOptional()
  @IsInt()
  paymentCommitmentCents?: number;

  @IsOptional()
  @IsIn([...GATE1_PAYMENT_COMMITMENT_TYPES])
  paymentCommitmentType?: string;

  @IsOptional()
  @IsString()
  paymentNotes?: string;

  @IsOptional()
  @IsInt()
  clientRevisionRounds?: number;

  @IsOptional()
  @IsNumber()
  advisorActualHours?: number;

  @IsOptional()
  @IsInt()
  exceptionCostCents?: number;

  @IsOptional()
  @IsBoolean()
  markCompleted?: boolean;
}

export class ParticipantFeedbackDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsBoolean()
  wouldRecommend?: boolean;

  @IsOptional()
  @IsString()
  comment?: string;
}

export class ProposalFeedbackDto {
  @IsIn(['ACCEPT', 'CONCERN', 'REJECT', 'NEED_INFO', 'PRIVATE_CONTACT'])
  response!: 'ACCEPT' | 'CONCERN' | 'REJECT' | 'NEED_INFO' | 'PRIVATE_CONTACT';

  @IsOptional()
  @IsString()
  reasonType?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  privateNote?: string;
}

export class AcceptInvitationDto {
  @IsOptional()
  @IsString()
  userId?: string;

  /** 邀请目标与当前账号不一致时，用户二次确认后传 true */
  @IsOptional()
  @IsBoolean()
  confirmMismatch?: boolean;

  @IsOptional()
  @IsString()
  contactEmail?: string;
}

export class CreateParticipantTaskDto {
  @IsUUID()
  participantId!: string;

  @IsIn([...GATE1_PARTICIPANT_TASK_CATEGORIES])
  category!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  taskType?: string;

  @IsOptional()
  @IsIn([...GATE1_TASK_PRIORITIES])
  priority?: string;

  @IsOptional()
  @IsBoolean()
  blocking?: boolean;

  @IsOptional()
  @IsBoolean()
  mandatory?: boolean;

  @IsOptional()
  @IsString()
  dueAt?: string;
}

export class CompleteParticipantTaskDto {
  @IsOptional()
  evidence?: unknown;
}

export class WaiveParticipantTaskDto {
  @IsString()
  reason!: string;
}

export class CreateChangeNoticeDto {
  @IsIn([...GATE1_CHANGE_SEVERITIES])
  severity!: string;

  @IsString()
  title!: string;

  @IsString()
  whatHappened!: string;

  @IsOptional()
  @IsString()
  impactSummary?: string;

  @IsOptional()
  @IsString()
  actionRequired?: string;

  @IsOptional()
  @IsString()
  deadline?: string;

  @IsOptional()
  @IsUUID()
  planBId?: string;

  @IsOptional()
  @IsUUID()
  travelEventId?: string;

  @IsOptional()
  @IsBoolean()
  requiresAck?: boolean;
}

export class AckChangeNoticeDto {
  @IsOptional()
  @IsBoolean()
  helpRequested?: boolean;
}

export class LinkTrustedListingDto {
  @IsUUID()
  listingId!: string;
}

export class CreateAdvisorCandidateDto {
  @IsString()
  label!: string;

  @IsOptional()
  @IsUUID()
  basedOnCandidateId?: string;

  @IsString()
  strategySummary!: string;

  @IsOptional()
  constraintSatisfaction?: unknown;

  @IsOptional()
  tradeoffs?: unknown;

  @IsOptional()
  risks?: unknown;

  @IsOptional()
  @IsString()
  budgetSummary?: string;

  @IsOptional()
  @IsString()
  modificationNote?: string;
}

export class ReadinessFindingActionDto {
  @IsIn(['ASSIGN', 'ACCEPT_RISK', 'RESOLVE', 'SELECT_SOLUTION'])
  action!: 'ASSIGN' | 'ACCEPT_RISK' | 'RESOLVE' | 'SELECT_SOLUTION';

  @IsOptional()
  @IsString()
  responsibleParty?: string;

  @IsOptional()
  @IsString()
  dueAt?: string;

  @IsOptional()
  @IsString()
  solutionSummary?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
