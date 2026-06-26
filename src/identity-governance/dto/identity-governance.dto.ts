import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PUBLISHING_LEVELS, PublishingLevel, VERIFICATION_TYPES, VerificationType } from '../constants/identity-governance.constants';

export class SubmitPublishingPermissionApplicationDto {
  @ApiProperty({ enum: ['PUBLIC_NON_COMMERCIAL', 'PUBLIC_COMMERCIAL'] })
  @IsEnum(['PUBLIC_NON_COMMERCIAL', 'PUBLIC_COMMERCIAL'])
  requestedLevel!: Extract<PublishingLevel, 'PUBLIC_NON_COMMERCIAL' | 'PUBLIC_COMMERCIAL'>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;

  @ApiPropertyOptional({ enum: ['USER', 'ORGANIZATION'], default: 'USER' })
  @IsOptional()
  @IsEnum(['USER', 'ORGANIZATION'])
  subjectType?: 'USER' | 'ORGANIZATION';

  @ApiPropertyOptional({ description: '机构申请时必填 organizationId' })
  @IsOptional()
  @IsUUID()
  subjectId?: string;
}

export class ReviewPublishingApplicationDto {
  @IsEnum(['approve', 'reject'])
  action!: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}

export class StartVerificationDto {
  @ApiProperty({ enum: VERIFICATION_TYPES })
  @IsEnum(VERIFICATION_TYPES)
  type!: VerificationType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  realName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4)
  idNumberLast4?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  birthYear?: number;
}

export class ReviewVerificationDto {
  @IsEnum(['approve', 'reject', 'need_more_info'])
  action!: 'approve' | 'reject' | 'need_more_info';

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}

export class SaveAgencyDraftDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  legalName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  registeredAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  authorizedRepresentative?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  businessScope?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  refundPolicy?: string;
}

export class ReviewAgencyCertDto {
  @IsEnum(['approve', 'reject', 'need_more_info', 'suspend', 'restore'])
  action!: 'approve' | 'reject' | 'need_more_info' | 'suspend' | 'restore';

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}

export class CreateTrustedProjectDto {
  @IsString()
  @MaxLength(300)
  title!: string;

  @IsString()
  destination!: string;

  @IsString()
  startDate!: string;

  @IsString()
  endDate!: string;

  @IsString()
  @MaxLength(10000)
  summary!: string;

  @IsEnum(['NON_COMMERCIAL', 'COMMERCIAL'])
  commercialType!: 'NON_COMMERCIAL' | 'COMMERCIAL';

  @IsOptional()
  @IsInt()
  @Min(1)
  slotsTotal?: number;

  @IsOptional()
  @IsInt()
  budgetMinCents?: number;

  @IsOptional()
  @IsInt()
  budgetMaxCents?: number;

  @IsOptional()
  @IsString()
  riskDisclosure?: string;

  @IsOptional()
  @IsString()
  refundPolicy?: string;

  @IsOptional()
  @IsString()
  tripId?: string;

  @IsOptional()
  @IsUUID()
  organizationId?: string;
}

export class LinkTrustedProjectTripDto {
  @IsString()
  tripId!: string;
}

export class SubmitTrustedProjectApplicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}

export class ReviewTrustedProjectListingDto {
  @IsEnum(['approve', 'reject', 'need_revision', 'suspend'])
  action!: 'approve' | 'reject' | 'need_revision' | 'suspend';

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}

export class ReviewTrustedProjectApplicationDto {
  @IsEnum(['approve', 'reject'])
  action!: 'approve' | 'reject';
}

export class InviteOrganizationMemberDto {
  @IsString()
  email!: string;

  @IsOptional()
  roles?: string[];
}

export class ListTrustedProjectsQueryDto {
  @IsOptional()
  @IsString()
  destination?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;
}

export class SubmitQualificationDto {
  @ApiPropertyOptional({ enum: ['USER', 'ORGANIZATION'], default: 'USER' })
  @IsOptional()
  @IsEnum(['USER', 'ORGANIZATION'])
  subjectType?: 'USER' | 'ORGANIZATION';

  @ApiPropertyOptional({ description: '机构资质时填 organizationId' })
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @ApiProperty({ example: 'FIRST_AID' })
  @IsString()
  @MaxLength(64)
  qualificationType!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  issuer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  certificateNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  validFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  validUntil?: string;
}

export class ReviewQualificationDto {
  @IsEnum(['verify', 'reject', 'revoke'])
  action!: 'verify' | 'reject' | 'revoke';

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}

export class RecordReputationEventDto {
  @ApiProperty({ enum: ['USER', 'ORGANIZATION'] })
  @IsEnum(['USER', 'ORGANIZATION'])
  subjectType!: 'USER' | 'ORGANIZATION';

  @IsUUID()
  subjectId!: string;

  @ApiProperty({
    enum: [
      'PROJECT_COMPLETED',
      'PROJECT_CANCELLED_BY_PROVIDER',
      'MEMBER_WITHDREW',
      'DOCUMENT_SUBMITTED_ON_TIME',
      'COMPLAINT_CONFIRMED',
      'PAYMENT_DISPUTE_UNRESOLVED',
      'PLAN_B_EXECUTED',
      'SAFETY_INCIDENT_CONFIRMED',
    ],
  })
  @IsString()
  @MaxLength(64)
  eventType!: string;

  @IsString()
  @MaxLength(64)
  evidenceSource!: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsUUID()
  listingId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  eventResult?: string;

  @IsOptional()
  @IsString()
  occurredAt?: string;
}

export class SubmitEndorsementDto {
  @ApiPropertyOptional({ enum: ['USER', 'ORGANIZATION'], default: 'ORGANIZATION' })
  @IsOptional()
  @IsEnum(['USER', 'ORGANIZATION'])
  endorserSubjectType?: 'USER' | 'ORGANIZATION';

  @ApiProperty({ description: '背书方 ID（机构为 organizationId）' })
  @IsUUID()
  endorserSubjectId!: string;

  @ApiProperty({ enum: ['USER', 'ORGANIZATION'] })
  @IsEnum(['USER', 'ORGANIZATION'])
  subjectType!: 'USER' | 'ORGANIZATION';

  @IsUUID()
  subjectId!: string;

  @ApiProperty({ example: 'PROJECT_LEADERSHIP' })
  @IsString()
  @MaxLength(64)
  endorsementType!: string;

  @ApiProperty({ description: '基于可验证事实的陈述' })
  @IsString()
  @MaxLength(5000)
  factStatement!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  relatedListingId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  relatedTripId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  expiresAt?: string;
}

export class ReviewEndorsementDto {
  @IsEnum(['activate', 'reject', 'revoke'])
  action!: 'activate' | 'reject' | 'revoke';

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}

export class CloseTrustedProjectDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

