import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OdysseyIntakeService } from '../odyssey-intake/odyssey-intake.service';
import { ReputationOsService } from '../reputation-os/reputation-os.service';
import { buildActiveTripDashboardView } from './engine/active-trip-dashboard.engine';
import type {
  ActiveTripCrewMemberView,
  ActiveTripDashboardView,
  ActiveTripViewerRole,
} from './types/active-trip-dashboard.types';

@Injectable()
export class ActiveTripDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly odysseyIntake: OdysseyIntakeService,
    private readonly reputationOs: ReputationOsService,
  ) {}

  async getActiveTripDashboard(userId: string, tripId: string): Promise<ActiveTripDashboardView> {
    const { trip, role, planningStyle } = await this.loadTripContext(userId, tripId);
    const crew = await this.buildCrewPanel(tripId);
    const collaboratorCount = await this.prisma.tripCollaborator.count({ where: { tripId } });

    return buildActiveTripDashboardView({
      trip: {
        tripId: trip.id,
        name: trip.name ?? '',
        destination: trip.destination ?? '',
        startDate: trip.startDate.toISOString().slice(0, 10),
        endDate: trip.endDate.toISOString().slice(0, 10),
        status: trip.status ?? '',
      },
      metadata: trip.metadata,
      viewerUserId: userId,
      viewerRole: role,
      planningStyle,
      crew,
      requiredAuthorizations: Math.max(1, collaboratorCount),
    });
  }

  private async loadTripContext(userId: string, tripId: string) {
    const collaborator = await this.prisma.tripCollaborator.findUnique({
      where: { tripId_userId: { tripId, userId } },
    });
    if (!collaborator) {
      throw new ForbiddenException('您不是该行程协作者');
    }

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        name: true,
        destination: true,
        startDate: true,
        endDate: true,
        status: true,
        metadata: true,
      },
    });
    if (!trip) {
      throw new NotFoundException('行程不存在');
    }

    const role: ActiveTripViewerRole = collaborator.role === 'OWNER' ? 'captain' : 'member';
    const planningStyle = await this.resolvePlanningStyle(trip.metadata);

    return { trip, role, planningStyle };
  }

  private async resolvePlanningStyle(metadata: unknown): Promise<string | null> {
    const inst = readInstantiationRecruitmentPostId(metadata);
    if (!inst) return null;

    const post = await this.prisma.matchSquareRecruitmentPost.findUnique({
      where: { id: inst },
      select: { planningStyle: true },
    });
    return post?.planningStyle ?? null;
  }

  private async buildCrewPanel(tripId: string): Promise<ActiveTripCrewMemberView[]> {
    const collaborators = await this.prisma.tripCollaborator.findMany({
      where: { tripId },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });

    return Promise.all(
      collaborators.map(async (c) => {
        const [profile, cardView, stars, user] = await Promise.all([
          this.odysseyIntake.getProfile(c.userId),
          this.odysseyIntake.getProfileCardView(c.userId).catch(() => null),
          this.reputationOs.getAverageStars(c.userId),
          this.prisma.user.findUnique({
            where: { id: c.userId },
            select: { displayName: true },
          }),
        ]);

        const cardTitle = profile?.card?.title ?? cardView?.profile?.card?.title ?? null;

        return {
          userId: c.userId,
          role: c.role === 'OWNER' ? ('captain' as const) : ('member' as const),
          displayName: user?.displayName ?? cardTitle ?? '队员',
          mbtiType: profile?.mbtiType ?? cardView?.profile?.mbtiType ?? null,
          cardTitle,
          interactionModeLabel: profile?.travelCollaborationGeneLabel ?? null,
          reputationStars: stars,
        };
      }),
    );
  }
}

function readInstantiationRecruitmentPostId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const inst = (metadata as Record<string, unknown>).matchSquareInstantiation;
  if (!inst || typeof inst !== 'object') return null;
  const postId = (inst as Record<string, unknown>).recruitmentPostId;
  return typeof postId === 'string' ? postId : null;
}
