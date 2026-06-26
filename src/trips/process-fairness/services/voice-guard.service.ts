import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TripPreferenceRoundAccessService } from './trip-preference-round-access.service';
import {
  detectVoiceGuardInterventions,
  computeEngagementScore,
  type VoiceGuardStatus,
} from '../utils/voice-guard.util';

@Injectable()
export class VoiceGuardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TripPreferenceRoundAccessService,
  ) {}

  async getStatus(tripId: string, userId: string): Promise<VoiceGuardStatus> {
    await this.access.assertTripMember(tripId, userId);
    const memberIds = await this.access.listMemberIds(tripId);
    const displayNames = await this.access.resolveDisplayNames(memberIds);

    const rows = await this.prisma.tripMemberParticipation.findMany({
      where: { tripId, userId: { in: memberIds } },
    });
    const byUser = new Map(rows.map((r) => [r.userId, r]));

    const members = memberIds.map((id) => {
      const row = byUser.get(id);
      const preferenceSubmits = row?.preferenceSubmits ?? 0;
      const voteParticipations = row?.voteParticipations ?? 0;
      const discussionUtterances = row?.discussionUtterances ?? 0;
      return {
        userId: id,
        displayName: displayNames.get(id) ?? '同行者',
        preferenceSubmits,
        voteParticipations,
        discussionUtterances,
        consecutiveSilentRounds: row?.consecutiveSilentRounds ?? 0,
        lastSpokeAt: row?.lastSpokeAt?.toISOString() ?? null,
        engagementScore: computeEngagementScore({
          preferenceSubmits,
          voteParticipations,
          discussionUtterances,
        }),
      };
    });

    const averageEngagementScore =
      members.length > 0
        ? members.reduce((sum, m) => sum + m.engagementScore, 0) / members.length
        : 0;

    return {
      tripId,
      memberCount: memberIds.length,
      averageEngagementScore,
      members,
      interventions: detectVoiceGuardInterventions(members),
    };
  }
}
