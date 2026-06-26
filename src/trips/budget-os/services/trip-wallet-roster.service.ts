import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { WalletMember } from '../types/travel-wallet.types';

export class RosterRequiredException extends BadRequestException {
  constructor() {
    super({
      code: 'ROSTER_REQUIRED',
      message: '组队行程需要至少一名成员才能设置付款规则',
    });
  }
}

/**
 * Resolve trip wallet roster: TripCollaborator → metadata member ids.
 */
export async function resolveTripWalletRoster(
  prisma: PrismaService,
  tripId: string,
): Promise<WalletMember[]> {
  const collaborators = await prisma.tripCollaborator.findMany({
    where: { tripId },
    orderBy: { createdAt: 'asc' },
  });

  if (collaborators.length > 0) {
    const userIds = collaborators.map((c) => c.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, displayName: true, email: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    return collaborators.map((c) => {
      const user = userMap.get(c.userId);
      return {
        userId: c.userId,
        displayName:
          user?.displayName ?? user?.email?.split('@')[0] ?? c.userId.slice(0, 8),
        role: c.role === 'owner' || c.role === 'leader' ? 'leader' : 'member',
      };
    });
  }

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { metadata: true },
  });
  const metadata = (trip?.metadata as Record<string, unknown>) ?? {};
  const memberIds = extractMetadataMemberIds(metadata);

  if (memberIds.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: memberIds } },
    select: { id: true, displayName: true, email: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  return memberIds.map((userId) => {
    const user = userMap.get(userId);
    return {
      userId,
      displayName:
        user?.displayName ?? user?.email?.split('@')[0] ?? userId.slice(0, 8),
      role: 'member' as const,
    };
  });
}

function extractMetadataMemberIds(metadata: Record<string, unknown>): string[] {
  const ids = new Set<string>();

  const teamMemberIds = metadata.teamMemberIds;
  if (Array.isArray(teamMemberIds)) {
    for (const id of teamMemberIds) {
      if (typeof id === 'string') ids.add(id);
    }
  }

  const matchSquare = metadata.matchSquare as Record<string, unknown> | undefined;
  const roster = matchSquare?.roster;
  if (Array.isArray(roster)) {
    for (const m of roster) {
      if (typeof m === 'string') ids.add(m);
      else if (m && typeof m === 'object' && 'userId' in m) {
        const uid = (m as { userId?: string }).userId;
        if (uid) ids.add(uid);
      }
    }
  }

  const ownerId = metadata.ownerUserId ?? metadata.userId;
  if (typeof ownerId === 'string') ids.add(ownerId);

  return [...ids];
}

export function assertRosterForWalletRule(
  roster: WalletMember[],
  splitBase: number,
): void {
  if (roster.length === 0) {
    throw new RosterRequiredException();
  }
  if (splitBase < 1) {
    throw new BadRequestException('splitBase 必须 >= 1');
  }
  if (splitBase > roster.length) {
    throw new BadRequestException(
      `splitBase (${splitBase}) 不能超过 roster 人数 (${roster.length})`,
    );
  }
}
