import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { InviteResolveResponseDto } from '../dto/invite-resolve.dto';

@Injectable()
export class InviteResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(token: string): Promise<InviteResolveResponseDto | null> {
    const tripMember = await this.resolveTripMember(token);
    if (tripMember) return tripMember;

    const team = await this.resolveTeam(token);
    if (team) return team;

    const gate1 = await this.resolveGate1(token);
    if (gate1) return gate1;

    return null;
  }

  private async resolveTripMember(
    token: string,
  ): Promise<InviteResolveResponseDto | null> {
    const invite = await this.prisma.tripMemberInvite.findUnique({
      where: { inviteCode: token },
      include: {
        Trip: { select: { id: true, name: true, destination: true } },
      },
    });
    if (!invite) return null;

    const expired =
      invite.expiresAt != null && invite.expiresAt.getTime() < Date.now();

    return {
      kind: 'trip_member',
      token,
      targetPath: `/invite/${token}`,
      preview: {
        title: invite.Trip.name ?? undefined,
        subtitle: invite.contactHint ?? undefined,
        destination: invite.Trip.destination ?? undefined,
        tripId: invite.tripId,
        label: invite.label,
        expired,
      },
    };
  }

  private async resolveTeam(token: string): Promise<InviteResolveResponseDto | null> {
    const invite = await this.prisma.collaborationTeamInvite.findUnique({
      where: { inviteToken: token },
      include: { team: true },
    });
    if (!invite) return null;

    const expired = invite.expiresAt.getTime() < Date.now();
    const maxedOut =
      invite.maxUses > 0 && invite.usesCount >= invite.maxUses;
    if (expired || maxedOut) {
      return {
        kind: 'team',
        token,
        targetPath: `/invite/${token}`,
        preview: {
          title: invite.team.name,
          tripId: invite.tripId ?? undefined,
          expired: true,
        },
      };
    }

    let tripTitle: string | undefined;
    if (invite.tripId) {
      const trip = await this.prisma.trip.findUnique({
        where: { id: invite.tripId },
        select: { name: true, destination: true },
      });
      tripTitle = trip?.name ?? undefined;
    }

    return {
      kind: 'team',
      token,
      targetPath: `/invite/${token}`,
      preview: {
        title: tripTitle ?? invite.team.name,
        subtitle: invite.team.name,
        tripId: invite.tripId ?? undefined,
        expired: false,
      },
    };
  }

  private async resolveGate1(token: string): Promise<InviteResolveResponseDto | null> {
    const participant = await this.prisma.gate1Participant.findUnique({
      where: { inviteToken: token },
      include: {
        project: { select: { id: true, title: true, destination: true } },
      },
    });
    if (!participant) return null;

    const expired =
      participant.inviteExpiresAt != null &&
      participant.inviteExpiresAt.getTime() < Date.now();
    const revoked = participant.inviteRevokedAt != null;

    return {
      kind: 'gate1_participant',
      token,
      targetPath: `/participant/invites/${token}`,
      preview: {
        title: participant.project.title,
        destination: participant.project.destination ?? undefined,
        label: participant.displayName ?? undefined,
        expired: expired || revoked,
      },
    };
  }
}
