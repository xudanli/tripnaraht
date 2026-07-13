import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ArrayMaxSize,
} from 'class-validator';

export class MemberInvitePreviewDto {
  @ApiProperty()
  inviteCode!: string;

  @ApiProperty()
  tripId!: string;

  @ApiPropertyOptional()
  tripName?: string;

  @ApiPropertyOptional()
  destination?: string;

  @ApiPropertyOptional({ description: '干系人角色标签' })
  label?: string;

  @ApiPropertyOptional()
  roleHint?: string;

  @ApiPropertyOptional()
  expired?: boolean;

  @ApiPropertyOptional()
  onboardingRequired?: boolean;

  @ApiPropertyOptional()
  onboardingCompleted?: boolean;
}

export class MemberInviteAcceptResponseDto {
  @ApiProperty()
  tripId!: string;

  @ApiPropertyOptional()
  memberId?: string;
}

export class MemberOnboardingDraftDto {
  @ApiProperty()
  inviteToken!: string;

  @ApiPropertyOptional()
  tripId?: string;

  @ApiProperty()
  displayName!: string;

  @ApiProperty({
    enum: ['MEMBER', 'PAYER', 'FINAL_CONFIRMER', 'GUARDIAN', 'PRIMARY_CONTACT'],
  })
  tripRole!:
    | 'MEMBER'
    | 'PAYER'
    | 'FINAL_CONFIRMER'
    | 'GUARDIAN'
    | 'PRIMARY_CONTACT';

  @ApiPropertyOptional()
  guardianFor?: string;

  @ApiProperty({ type: [String], description: '最多 3 项' })
  coreWishes!: string[];

  @ApiProperty()
  mustExperience!: string;

  @ApiProperty()
  avoidExperience!: string;

  @ApiProperty({ enum: ['relaxed', 'moderate', 'active'] })
  pacePreference!: 'relaxed' | 'moderate' | 'active';

  @ApiProperty()
  earlyRiser!: boolean;

  @ApiPropertyOptional()
  maxDailyWalkKm?: number;

  @ApiProperty()
  lodgingPreference!: string;

  @ApiProperty()
  dietRestrictions!: string;

  @ApiProperty()
  healthNotes!: string;

  @ApiProperty({ enum: ['budget', 'moderate', 'premium'] })
  personalSpendingLevel!: 'budget' | 'moderate' | 'premium';

  @ApiProperty()
  personalSpendingNotes!: string;

  @ApiProperty({ enum: ['yes', 'no', 'depends'] })
  acceptSplitGroup!: 'yes' | 'no' | 'depends';

  @ApiProperty()
  splitGroupNotes!: string;

  @ApiProperty()
  privateNotes!: string;

  @ApiProperty({ enum: ['ANALYST_ONLY', 'SANITIZED_TO_ADVISOR'] })
  privateNotesAuth!: 'ANALYST_ONLY' | 'SANITIZED_TO_ADVISOR';

  @ApiPropertyOptional()
  currentStepId?: string;

  @ApiPropertyOptional()
  completedAt?: string;

  @ApiPropertyOptional()
  updatedAt?: string;
}

export class SaveMemberOnboardingDraftDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({
    enum: ['MEMBER', 'PAYER', 'FINAL_CONFIRMER', 'GUARDIAN', 'PRIMARY_CONTACT'],
  })
  @IsOptional()
  @IsEnum(['MEMBER', 'PAYER', 'FINAL_CONFIRMER', 'GUARDIAN', 'PRIMARY_CONTACT'])
  tripRole?:
    | 'MEMBER'
    | 'PAYER'
    | 'FINAL_CONFIRMER'
    | 'GUARDIAN'
    | 'PRIMARY_CONTACT';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  guardianFor?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(3)
  coreWishes?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mustExperience?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  avoidExperience?: string;

  @ApiPropertyOptional({ enum: ['relaxed', 'moderate', 'active'] })
  @IsOptional()
  @IsEnum(['relaxed', 'moderate', 'active'])
  pacePreference?: 'relaxed' | 'moderate' | 'active';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  earlyRiser?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  maxDailyWalkKm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lodgingPreference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dietRestrictions?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  healthNotes?: string;

  @ApiPropertyOptional({ enum: ['budget', 'moderate', 'premium'] })
  @IsOptional()
  @IsEnum(['budget', 'moderate', 'premium'])
  personalSpendingLevel?: 'budget' | 'moderate' | 'premium';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  personalSpendingNotes?: string;

  @ApiPropertyOptional({ enum: ['yes', 'no', 'depends'] })
  @IsOptional()
  @IsEnum(['yes', 'no', 'depends'])
  acceptSplitGroup?: 'yes' | 'no' | 'depends';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  splitGroupNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  privateNotes?: string;

  @ApiPropertyOptional({ enum: ['ANALYST_ONLY', 'SANITIZED_TO_ADVISOR'] })
  @IsOptional()
  @IsEnum(['ANALYST_ONLY', 'SANITIZED_TO_ADVISOR'])
  privateNotesAuth?: 'ANALYST_ONLY' | 'SANITIZED_TO_ADVISOR';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currentStepId?: string;
}

export class MemberOnboardingSubmitResponseDto {
  @ApiProperty()
  tripId!: string;

  @ApiPropertyOptional()
  memberId?: string;

  @ApiProperty({ enum: ['SUBMITTED'] })
  status!: 'SUBMITTED';

  @ApiProperty()
  homePath!: string;
}
