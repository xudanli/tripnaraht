import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { CollaborativeTaskItem } from '../domain-influence/types/trip-domain.types';
import type { OnboardingStatus, FrictionRadarSnapshot, CompatibilityBand } from '../decision-profiling/types/decision-profiling.types';

export type CollabOverviewInclude =
  | 'members'
  | 'tasks'
  | 'domain'
  | 'votes'
  | 'profiling'
  | 'wishes'
  | 'health';

export class CollabOverviewMemberDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiPropertyOptional()
  email?: string | null;

  @ApiPropertyOptional()
  displayName?: string | null;

  @ApiProperty()
  role!: string;
}

export class CollabOverviewTeamRefDto {
  @ApiPropertyOptional()
  teamId?: string | null;

  @ApiPropertyOptional({ description: 'Optimization V2 团队需单独 GET /v2/user/team/:teamId' })
  fetchPath?: string | null;
}

export class CollabTeamHealthDto {
  @ApiProperty({ description: '协作进度 0–100（画像 + 领域 + 协商任务加权）' })
  progressPercent!: number;

  @ApiProperty({ description: '进行中的讨论/投票/待认领任务数' })
  discussionCount!: number;

  @ApiProperty()
  highFrictionCount!: number;

  @ApiPropertyOptional({ enum: ['high', 'needs_negotiation', 'high_risk'] })
  compatibilityBand?: CompatibilityBand;

  @ApiProperty({ enum: ['healthy', 'attention', 'at_risk'] })
  status!: 'healthy' | 'attention' | 'at_risk';
}

export class CollabOverviewSilentVoteSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  status!: string;

  @ApiPropertyOptional()
  closesAt?: string | null;
}

export class CollabOverviewDomainSummaryDto {
  @ApiProperty()
  memberCount!: number;

  @ApiProperty()
  completionRate!: number;

  @ApiProperty()
  rulesConfirmed!: boolean;

  @ApiProperty()
  balanceWarningCount!: number;

  @ApiProperty()
  allMembersClaimed!: boolean;
}

export class CollabOverviewResponseDto {
  @ApiProperty()
  tripId!: string;

  @ApiPropertyOptional()
  teamId?: string | null;

  @ApiPropertyOptional({ type: CollabOverviewTeamRefDto })
  team?: CollabOverviewTeamRefDto;

  @ApiProperty()
  memberCount!: number;

  @ApiPropertyOptional()
  travelerCount?: number;

  @ApiProperty({ type: [CollabOverviewMemberDto] })
  collaborators!: CollabOverviewMemberDto[];

  @ApiProperty({ type: CollabTeamHealthDto })
  teamHealth!: CollabTeamHealthDto;

  @ApiProperty({ type: [Object] })
  collaborativeTasks!: CollaborativeTaskItem[];

  @ApiProperty()
  collaborativeTaskCount!: number;

  @ApiPropertyOptional({ type: CollabOverviewDomainSummaryDto })
  domainInfluence?: CollabOverviewDomainSummaryDto;

  @ApiProperty()
  openSilentVoteCount!: number;

  @ApiProperty({ type: [CollabOverviewSilentVoteSummaryDto] })
  silentVotes!: CollabOverviewSilentVoteSummaryDto[];

  @ApiPropertyOptional()
  profilingOnboarding?: OnboardingStatus;

  @ApiPropertyOptional()
  frictionRadar?: Pick<
    FrictionRadarSnapshot,
    'completionRate' | 'completedCount' | 'memberCount' | 'highRiskAlerts' | 'compatibility' | 'computedAt'
  >;

  @ApiPropertyOptional()
  wishSummary?: {
    privateCount: number;
    mineCount: number;
    teamCount: number;
    agentEligibleCount: number;
  };

  @ApiProperty()
  generatedAt!: string;
}
