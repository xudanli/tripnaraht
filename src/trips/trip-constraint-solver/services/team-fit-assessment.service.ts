import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { ConflictDto } from '../../dto/trip-conflicts.dto';
import {
  assessTeamFit,
  filterValidMemberUserIds,
  parseStoredMoneyDnaCard,
  parseStoredTravelStyleCard,
  type TeamFitAssessmentResult,
  type TeamFitMemberInput,
} from '../utils/team-fit-assessment.util';

@Injectable()
export class TeamFitAssessmentService {
  constructor(private readonly prisma: PrismaService) {}

  async assessForTrip(tripId: string, conflicts: ConflictDto[]): Promise<TeamFitAssessmentResult> {
    const members = await this.loadMembers(tripId);
    return assessTeamFit({ tripId, members, conflicts });
  }

  private async loadMembers(tripId: string): Promise<TeamFitMemberInput[]> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { TripCollaborator: true },
    });
    if (!trip) return [];

    const rawMemberIds = [
      ...trip.TripCollaborator.map((c) => c.userId),
      (trip.metadata as { userId?: string } | null)?.userId,
    ].filter((id): id is string => typeof id === 'string' && id.length > 0);

    const ids = filterValidMemberUserIds(rawMemberIds);
    if (ids.length === 0) return [];

    const [users, profilingStatuses, profiles] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, displayName: true },
      }),
      this.prisma.tripDecisionProfilingStatus.findMany({
        where: { tripId, userId: { in: ids } },
      }),
      this.prisma.userDecisionProfilingProfile.findMany({
        where: { userId: { in: ids } },
      }),
    ]);

    const nameById = new Map(users.map((u) => [u.id, u.displayName || u.id.slice(0, 8)]));
    const statusByUser = new Map(profilingStatuses.map((s) => [s.userId, s]));
    const profileByUser = new Map(profiles.map((p) => [p.userId, p]));

    return ids.map((userId) => {
      const status = statusByUser.get(userId);
      const profile = profileByUser.get(userId);
      return {
        userId,
        displayName: nameById.get(userId) ?? userId.slice(0, 8),
        quizCompleted: Boolean(status?.quizCompleted),
        style: parseStoredTravelStyleCard(userId, profile?.travelStyleCard),
        money: parseStoredMoneyDnaCard(userId, profile?.moneyDnaCard),
      };
    });
  }
}
