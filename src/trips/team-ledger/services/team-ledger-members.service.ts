import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { TeamLedgerMember } from '../types/team-ledger.types';

interface RosterCandidate {
  id: string;
  participatesInSplit: boolean;
  nameHint?: string;
}

/**
 * Resolve Team Ledger members from collaborators + metadata roster.
 * Child / non-splitting members: metadata.isChild / participatesInSplit=false.
 */
@Injectable()
export class TeamLedgerMembersService {
  constructor(private readonly prisma: PrismaService) {}

  async listMembers(tripId: string): Promise<TeamLedgerMember[]> {
    const candidates = await this.resolveCandidates(tripId);
    if (candidates.length === 0) return [];

    const userIds = candidates
      .map((c) => c.id)
      .filter((id) => !id.startsWith('m_local_') && !id.startsWith('child_'));

    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, displayName: true, email: true, avatarUrl: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    return candidates.map((c) => {
      const user = userMap.get(c.id);
      const name =
        user?.displayName?.trim() ||
        user?.email?.split('@')[0] ||
        c.nameHint ||
        c.id.slice(0, 8);
      return {
        id: c.id,
        name,
        avatarUrl: user?.avatarUrl ?? null,
        participatesInSplit: c.participatesInSplit,
      };
    });
  }

  async getMemberMap(tripId: string): Promise<Map<string, TeamLedgerMember>> {
    const members = await this.listMembers(tripId);
    return new Map(members.map((m) => [m.id, m]));
  }

  memberIds(members: TeamLedgerMember[]): Set<string> {
    return new Set(members.map((m) => m.id));
  }

  private async resolveCandidates(tripId: string): Promise<RosterCandidate[]> {
    const byId = new Map<string, RosterCandidate>();

    const collaborators = await this.prisma.tripCollaborator.findMany({
      where: { tripId },
      orderBy: { createdAt: 'asc' },
    });
    for (const c of collaborators) {
      byId.set(c.userId, { id: c.userId, participatesInSplit: true });
    }

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const metadata = (trip?.metadata as Record<string, unknown>) ?? {};

    const ownerId = metadata.ownerUserId ?? metadata.userId;
    if (typeof ownerId === 'string' && !byId.has(ownerId)) {
      byId.set(ownerId, { id: ownerId, participatesInSplit: true });
    }

    for (const id of extractStringIds(metadata.teamMemberIds)) {
      if (!byId.has(id)) {
        byId.set(id, { id, participatesInSplit: true });
      }
    }

    for (const row of extractRosterRows(metadata)) {
      const existing = byId.get(row.id);
      if (existing) {
        existing.participatesInSplit =
          existing.participatesInSplit && row.participatesInSplit;
        if (row.nameHint && !existing.nameHint) existing.nameHint = row.nameHint;
      } else {
        byId.set(row.id, row);
      }
    }

    // Explicit ledger split exclusions
    const exclusions = metadata.ledgerSplitExclusions;
    if (Array.isArray(exclusions)) {
      for (const id of exclusions) {
        if (typeof id !== 'string') continue;
        const row = byId.get(id);
        if (row) row.participatesInSplit = false;
      }
    }

    return [...byId.values()];
  }
}

function extractStringIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === 'string');
}

function extractRosterRows(metadata: Record<string, unknown>): RosterCandidate[] {
  const out: RosterCandidate[] = [];

  const matchSquare = metadata.matchSquare as Record<string, unknown> | undefined;
  const roster = matchSquare?.roster ?? metadata.roster ?? metadata.ledgerMembers;
  if (!Array.isArray(roster)) return out;

  for (const item of roster) {
    if (typeof item === 'string') {
      out.push({ id: item, participatesInSplit: true });
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const id =
      (typeof row.id === 'string' && row.id) ||
      (typeof row.userId === 'string' && row.userId) ||
      (typeof row.memberId === 'string' && row.memberId) ||
      null;
    if (!id) continue;

    const isChild =
      row.isChild === true ||
      String(row.ageGroup ?? '').toLowerCase() === 'child' ||
      row.participatesInSplit === false;

    const nameHint =
      (typeof row.name === 'string' && row.name) ||
      (typeof row.displayName === 'string' && row.displayName) ||
      undefined;

    out.push({
      id,
      participatesInSplit: !isChild,
      nameHint,
    });
  }

  return out;
}
