import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type MemberOnboardingPendingReason =
  | 'onboarding_not_started'
  | 'onboarding_in_progress'
  | 'onboarding_not_submitted';

export class MemberOnboardingProfileDto {
  @ApiProperty()
  userId!: string;

  @ApiPropertyOptional()
  user_id?: string;

  @ApiPropertyOptional()
  memberId?: string;

  @ApiPropertyOptional()
  member_id?: string;

  @ApiProperty()
  displayName!: string;

  @ApiPropertyOptional()
  display_name?: string;

  @ApiProperty()
  tripRole!: string;

  @ApiPropertyOptional()
  trip_role?: string;

  @ApiPropertyOptional()
  guardianFor?: string;

  @ApiPropertyOptional()
  guardian_for?: string;

  @ApiProperty({ type: [String] })
  coreWishes!: string[];

  @ApiPropertyOptional({ type: [String] })
  core_wishes?: string[];

  @ApiProperty()
  mustExperience!: string;

  @ApiPropertyOptional()
  must_experience?: string;

  @ApiProperty()
  avoidExperience!: string;

  @ApiPropertyOptional()
  avoid_experience?: string;

  @ApiProperty()
  pacePreference!: string;

  @ApiPropertyOptional()
  pace_preference?: string;

  @ApiProperty()
  earlyRiser!: boolean;

  @ApiPropertyOptional()
  early_riser?: boolean;

  @ApiPropertyOptional()
  maxDailyWalkKm?: number;

  @ApiPropertyOptional()
  max_daily_walk_km?: number;

  @ApiProperty()
  lodgingPreference!: string;

  @ApiPropertyOptional()
  lodging_preference?: string;

  @ApiProperty()
  dietRestrictions!: string;

  @ApiPropertyOptional()
  diet_restrictions?: string;

  @ApiProperty()
  healthNotes!: string;

  @ApiPropertyOptional()
  health_notes?: string;

  @ApiProperty()
  personalSpendingLevel!: string;

  @ApiPropertyOptional()
  personal_spending_level?: string;

  @ApiProperty()
  personalSpendingNotes!: string;

  @ApiPropertyOptional()
  personal_spending_notes?: string;

  @ApiProperty()
  acceptSplitGroup!: string;

  @ApiPropertyOptional()
  accept_split_group?: string;

  @ApiProperty()
  splitGroupNotes!: string;

  @ApiPropertyOptional()
  split_group_notes?: string;

  @ApiProperty({ enum: ['ANALYST_ONLY', 'SANITIZED_TO_ADVISOR'] })
  privateNotesAuth!: 'ANALYST_ONLY' | 'SANITIZED_TO_ADVISOR';

  @ApiPropertyOptional({ enum: ['ANALYST_ONLY', 'SANITIZED_TO_ADVISOR'] })
  private_notes_auth?: 'ANALYST_ONLY' | 'SANITIZED_TO_ADVISOR';

  @ApiPropertyOptional({
    description: '脱敏摘要；ANALYST_ONLY 时为 null；永不返回 privateNotes 原文',
  })
  advisorVisiblePrivateNotes?: string | null;

  @ApiPropertyOptional()
  advisor_visible_private_notes?: string | null;

  @ApiPropertyOptional()
  roleSlot?: string;

  @ApiPropertyOptional()
  role_slot?: string;

  @ApiPropertyOptional()
  label?: string;

  @ApiProperty()
  completedAt!: string;

  @ApiPropertyOptional()
  completed_at?: string;

  @ApiPropertyOptional()
  submittedAt?: string;

  @ApiPropertyOptional()
  submitted_at?: string;

  @ApiPropertyOptional()
  updatedAt?: string;

  @ApiPropertyOptional()
  updated_at?: string;

  @ApiPropertyOptional()
  inviteToken?: string;

  @ApiPropertyOptional()
  invite_token?: string;
}

export class MemberOnboardingPendingMemberDto {
  @ApiProperty()
  userId!: string;

  @ApiPropertyOptional()
  user_id?: string;

  @ApiPropertyOptional()
  memberId?: string;

  @ApiPropertyOptional()
  member_id?: string;

  @ApiPropertyOptional()
  displayName?: string;

  @ApiPropertyOptional()
  display_name?: string;

  @ApiPropertyOptional()
  label?: string;

  @ApiPropertyOptional()
  roleSlot?: string;

  @ApiPropertyOptional()
  role_slot?: string;

  @ApiProperty({
    enum: [
      'onboarding_not_started',
      'onboarding_in_progress',
      'onboarding_not_submitted',
    ],
  })
  reason!: MemberOnboardingPendingReason;
}

export class MemberOnboardingProfilesResponseDto {
  @ApiProperty()
  tripId!: string;

  @ApiPropertyOptional()
  trip_id?: string;

  @ApiProperty({ type: [MemberOnboardingProfileDto] })
  profiles!: MemberOnboardingProfileDto[];

  @ApiProperty({ type: [MemberOnboardingPendingMemberDto] })
  pendingMembers!: MemberOnboardingPendingMemberDto[];

  @ApiPropertyOptional({ type: [MemberOnboardingPendingMemberDto] })
  pending_members?: MemberOnboardingPendingMemberDto[];
}
