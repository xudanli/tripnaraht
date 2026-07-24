import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TripExtendedService } from './trip-extended.service';
import { TripDomainInfluenceService } from '../domain-influence/services/trip-domain-influence.service';
import { TripSilentVoteService } from '../silent-vote/services/trip-silent-vote.service';
import { DecisionProfilingService } from '../decision-profiling/services/decision-profiling.service';
import { FrictionRadarService } from '../decision-profiling/services/friction-radar.service';
import { TripWishService } from '../wishlist/services/trip-wish.service';
import { DecisionProfilingAccessService } from '../decision-profiling/services/decision-profiling-access.service';
import type { CollabOverviewResponseDto } from '../dto/collab-overview.dto';
import type { CollaborativeTaskItem } from '../domain-influence/types/trip-domain.types';
import type { OnboardingStatus } from '../decision-profiling/types/decision-profiling.types';
import {
  computeCollabTeamHealth,
  parseCollabOverviewInclude,
  resolveTeamId,
  resolveTravelerCount,
} from '../utils/collab-overview.util';

@Injectable()
export class CollabOverviewService {
  private readonly logger = new Logger(CollabOverviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: DecisionProfilingAccessService,
    private readonly tripExtended: TripExtendedService,
    private readonly domainInfluence: TripDomainInfluenceService,
    private readonly decisionProfiling: DecisionProfilingService,
    private readonly frictionRadar: FrictionRadarService,
    private readonly wishService: TripWishService,
    @Optional() private readonly silentVotes?: TripSilentVoteService,
  ) {}

  async getCollabOverview(
    tripId: string,
    userId: string,
    query: { include?: string },
  ): Promise<CollabOverviewResponseDto> {
    await this.access.assertTripMember(tripId, userId);
    const include = parseCollabOverviewInclude(query.include);
    const resolvedUserId = userId || 'anonymous-dev-user';

    const tripRow = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });

    const teamId = resolveTeamId(tripRow?.metadata);

    const [
      collaboratorsResult,
      tasksResult,
      domainResult,
      votesResult,
      onboardingResult,
      radarResult,
      wishesResult,
    ] = await Promise.allSettled([
      include.has('members')
        ? this.tripExtended.getCollaborators(tripId)
        : Promise.resolve([]),
      include.has('tasks')
        ? this.domainInfluence.listCollaborativeTasks(tripId, resolvedUserId)
        : Promise.resolve({ tasks: [] as CollaborativeTaskItem[] }),
      include.has('domain')
        ? this.domainInfluence.getSnapshot(tripId, resolvedUserId)
        : Promise.resolve(null),
      include.has('votes') && this.silentVotes
        ? this.silentVotes.listVotes(tripId, resolvedUserId)
        : Promise.resolve([]),
      include.has('profiling')
        ? this.decisionProfiling.getOnboardingStatus(tripId, resolvedUserId)
        : Promise.resolve(null),
      include.has('profiling') || include.has('health')
        ? this.frictionRadar.getRadar(tripId, resolvedUserId)
        : Promise.resolve(null),
      include.has('wishes')
        ? this.wishService.getWishSummary(tripId, resolvedUserId)
        : Promise.resolve(null),
    ]);

    const collaborators = this.unwrap(collaboratorsResult, []);
    const { tasks: collaborativeTasks } = this.unwrap(tasksResult, { tasks: [] });
    const domainSnapshot = this.unwrap(domainResult, null);
    const silentVoteDetails = this.unwrap(votesResult, []);
    const profilingOnboarding = this.unwrap(onboardingResult, null) as OnboardingStatus | null;
    const frictionRadarFull = this.unwrap(radarResult, null);
    const wishSummary = this.unwrap(wishesResult, null);

    const silentVotes = silentVoteDetails.map((v) => ({
      id: v.id,
      title: v.title,
      status: v.status,
      closesAt: v.closesAt,
    }));
    const openSilentVoteCount = silentVotes.filter((v) => v.status === 'open').length;

    const profilingCompletionRate =
      frictionRadarFull?.completionRate ??
      profilingOnboarding?.teamCompletionRate ??
      0;
    const domainCompletionRate = domainSnapshot?.completionRate ?? 0;

    const teamHealth = computeCollabTeamHealth({
      profilingCompletionRate,
      domainCompletionRate,
      collaborativeTasks,
      openSilentVoteCount,
      highFrictionCount: frictionRadarFull?.highRiskAlerts?.length ?? 0,
      compatibilityBand: frictionRadarFull?.compatibility?.band,
    });

    const memberCount = Math.max(
      collaborators.length,
      domainSnapshot?.memberCount ?? 0,
      frictionRadarFull?.memberCount ?? 0,
      1,
    );

    const frictionRadar =
      frictionRadarFull && (include.has('profiling') || include.has('health'))
        ? {
            completionRate: frictionRadarFull.completionRate,
            completedCount: frictionRadarFull.completedCount,
            memberCount: frictionRadarFull.memberCount,
            highRiskAlerts: frictionRadarFull.highRiskAlerts,
            compatibility: frictionRadarFull.compatibility,
            computedAt: frictionRadarFull.computedAt,
          }
        : undefined;

    return {
      tripId,
      teamId,
      team: teamId
        ? { teamId, fetchPath: `/v2/user/team/${teamId}` }
        : { teamId: null, fetchPath: null },
      memberCount,
      travelerCount: resolveTravelerCount(tripRow?.metadata, memberCount),
      collaborators: collaborators.map((c) => ({
        id: c.id,
        userId: c.userId,
        email: c.email,
        displayName: c.displayName,
        role: c.role,
      })),
      teamHealth,
      collaborativeTasks,
      collaborativeTaskCount: collaborativeTasks.length,
      domainInfluence: domainSnapshot
        ? {
            memberCount: domainSnapshot.memberCount,
            completionRate: domainSnapshot.completionRate,
            rulesConfirmed: domainSnapshot.rulesConfirmed,
            balanceWarningCount: domainSnapshot.balanceWarnings.length,
            allMembersClaimed: domainSnapshot.allMembersClaimed,
          }
        : undefined,
      openSilentVoteCount,
      silentVotes,
      profilingOnboarding: profilingOnboarding ?? undefined,
      frictionRadar,
      wishSummary: wishSummary
        ? {
            privateCount: wishSummary.privateCount,
            mineCount: wishSummary.mineCount,
            teamCount: wishSummary.teamCount,
            agentEligibleCount: wishSummary.agentEligibleCount,
          }
        : undefined,
      generatedAt: new Date().toISOString(),
    };
  }

  private unwrap<T>(result: PromiseSettledResult<T>, fallback: T): T {
    if (result.status === 'fulfilled') {
      return result.value ?? fallback;
    }
    const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
    this.logger.warn(`collab-overview partial failure: ${reason}`);
    return fallback;
  }
}
