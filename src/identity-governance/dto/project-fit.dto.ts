import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ELIGIBILITY_RULE_TYPES,
  ELIGIBILITY_SEVERITIES,
  EVIDENCE_REQUIREMENTS,
  LEADER_DECISIONS,
  STRUCTURED_REJECT_REASONS,
  WAIVER_POLICIES,
} from '../constants/project-fit.constants';

export class UpsertEligibilityRuleDto {
  @ApiProperty({ enum: ELIGIBILITY_RULE_TYPES })
  @IsEnum(ELIGIBILITY_RULE_TYPES)
  ruleType!: string;

  @IsString()
  @MaxLength(64)
  conditionKey!: string;

  @IsString()
  @MaxLength(32)
  operator!: string;

  value!: Record<string, unknown>;

  @ApiProperty({ enum: ELIGIBILITY_SEVERITIES })
  @IsEnum(ELIGIBILITY_SEVERITIES)
  severity!: string;

  @ApiProperty({ enum: EVIDENCE_REQUIREMENTS })
  @IsEnum(EVIDENCE_REQUIREMENTS)
  evidenceRequirement!: string;

  @ApiProperty({ enum: WAIVER_POLICIES })
  @IsEnum(WAIVER_POLICIES)
  waiverPolicy!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  explanationTemplate?: string;
}

export class FitAnswerItemDto {
  @IsString()
  @MaxLength(64)
  questionKey!: string;

  answer!: unknown;

  @ApiPropertyOptional({ enum: ['LOW', 'MEDIUM', 'HIGH'] })
  @IsOptional()
  @IsString()
  sensitivityLevel?: string;

  @IsOptional()
  consentScope?: Record<string, unknown>;
}

export class SaveFitAnswersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FitAnswerItemDto)
  answers!: FitAnswerItemDto[];
}

export class SubmitFitApplicationDto {
  @IsUUID()
  fitAssessmentId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}

export class LeaderApplicationDecisionDto {
  @ApiProperty({ enum: LEADER_DECISIONS })
  @IsEnum(LEADER_DECISIONS)
  decision!: 'APPROVE' | 'APPROVE_AFTER_CLARIFICATION' | 'WAITLIST' | 'REJECT' | 'REVOKE_APPROVAL';

  @ApiPropertyOptional({ enum: STRUCTURED_REJECT_REASONS })
  @IsOptional()
  @IsEnum(STRUCTURED_REJECT_REASONS)
  structuredRejectReason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}

export class SubmitProjectFitAppealDto {
  @IsString()
  @MaxLength(64)
  targetType!: string;

  @IsString()
  targetId!: string;

  @IsString()
  @MaxLength(5000)
  reason!: string;
}

export class UpdateListingFitConfigDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  enabledSoftDimensions?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  previewQuestionKeys?: string[];
}

export class ClarificationResponseDto {
  @IsString()
  @MaxLength(5000)
  message!: string;
}

export class ResolveProjectFitAppealDto {
  @IsString()
  @MaxLength(5000)
  resolution!: string;

  @IsEnum(['UPHELD', 'PARTIALLY_UPHELD', 'REJECTED'])
  status!: 'UPHELD' | 'PARTIALLY_UPHELD' | 'REJECTED';
}

export class AppealAdminNoteDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CreateRuleTemplateDto {
  @IsEnum(['PLATFORM', 'ORGANIZATION'])
  ownerSubjectType!: 'PLATFORM' | 'ORGANIZATION';

  @IsUUID()
  ownerSubjectId!: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  destinationTag?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  commercialType?: string;

  @IsArray()
  rules!: UpsertEligibilityRuleDto[];

  @ApiPropertyOptional()
  @IsOptional()
  fitConfig?: UpdateListingFitConfigDto;
}

export class ApplyRuleTemplateDto {
  @IsUUID()
  templateId!: string;
}

export class SubmitReputationDisputeDto {
  @IsUUID()
  eventId!: string;

  @IsString()
  @MaxLength(5000)
  reason!: string;
}

export class ResolveReputationDisputeDto {
  @IsString()
  @MaxLength(5000)
  resolution!: string;

  @IsEnum(['UPHELD', 'REJECTED'])
  status!: 'UPHELD' | 'REJECTED';
}

export class ApplicationCenterQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  listingId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  limit?: number;
}

export class UploadFitDocumentBase64Dto {
  @IsEnum(['ID_CARD', 'PASSPORT', 'QUALIFICATION_CERT', 'MEDICAL_CERT', 'INSURANCE', 'OTHER'])
  documentType!: string;

  @IsString()
  @MaxLength(512)
  fileName!: string;

  @IsString()
  @MaxLength(128)
  mimeType!: string;

  @IsString()
  contentBase64!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  linkedQuestionKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  locale?: string;
}
