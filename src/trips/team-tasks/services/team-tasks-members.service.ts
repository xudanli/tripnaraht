import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { TeamTaskMember } from '../types/team-tasks.types';

/**
 * Resolve displayable trip members (collaborators + metadata roster / owner).
 */
@Injectable()
export class TeamTasksMembersService {
  constructor(private readonly prisma: PrismaService) {}

  async listMembers(tripId: string): Promise<TeamTaskMember[]> {
    const ids = await this.resolveMemberIds(tripId);
    if (ids.length === 0) return [];

    const userIds = ids.filter(
      (id) => !id.startsWith('m_local_') && !id.startsWith('child_'),
    );
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, displayName: true, email: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    return ids.map((id) => {
      const user = userMap.get(id);
      const name =
        user?.displayName?.trim() ||
        user?.email?.split('@')[0] ||
        id.slice(0, 8);
      return { id, name };
    });
  }

  async getMemberMap(tripId: string): Promise<Map<string, TeamTaskMember>> {
    const members = await this.listMembers(tripId);
    return new Map(members.map((m) => [m.id, m]));
  }

  async resolveDisplayName(
    tripId: string,
    memberId: string,
  ): Promise<string> {
    const map = await this.getMemberMap(tripId);
    return map.get(memberId)?.name ?? memberId.slice(0, 8);
  }

  private async resolveMemberIds(tripId: string): Promise<string[]> {
    const byId = new Set<string>();

    const collaborators = await this.prisma.tripCollaborator.findMany({
      where: { tripId },
      orderBy: { createdAt: 'asc' },
    });
    for (const c of collaborators) byId.add(c.userId);

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const metadata = (trip?.metadata as Record<string, unknown>) ?? {};

    const ownerId = metadata.ownerUserId ?? metadata.userId;
    if (typeof ownerId === 'string') byId.add(ownerId);

    for (const id of extractStringIds(metadata.teamMemberIds)) {
      byId.add(id);
    }

    for (const id of extractRosterIds(metadata)) {
      byId.add(id);
    }

    return [...byId];
  }
}

function extractStringIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === 'string');
}

function extractRosterIds(metadata: Record<string, unknown>): string[] {
  const out: string[] = [];
  const matchSquare = metadata.matchSquare as Record<string, unknown> | undefined;
  const roster = matchSquare?.roster ?? metadata.roster ?? metadata.ledgerMembers;
  if (!Array.isArray(roster)) return out;

  for (const item of roster) {
    if (typeof item === 'string') {
      out.push(item);
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const id =
      (typeof row.id === 'string' && row.id) ||
      (typeof row.userId === 'string' && row.userId) ||
      (typeof row.memberId === 'string' && row.memberId) ||
      null;
    if (id) out.push(id);
  }
  return out;
}
