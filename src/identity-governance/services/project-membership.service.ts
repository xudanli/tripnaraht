import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { mapCollaboratorRoleToProjectRoles } from '../utils/project-membership.util';

type TxClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class ProjectMembershipService {
  constructor(private readonly prisma: PrismaService) {}

  async syncFromCollaborator(
    tripId: string,
    userId: string,
    collaboratorRole: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client: TxClient = tx ?? this.prisma;
    const roles = mapCollaboratorRoleToProjectRoles(collaboratorRole);

    await client.projectMembership.upsert({
      where: {
        tripId_userId: { tripId, userId },
      },
      create: {
        tripId,
        userId,
        roles,
        status: 'ACTIVE',
      },
      update: {
        roles,
        status: 'ACTIVE',
      },
    });
  }

  async listForUser(userId: string) {
    return this.prisma.projectMembership.findMany({
      where: { userId, status: 'ACTIVE' },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /** Trusted project JOINED → trip collaborator + project membership (PRD §6) */
  async joinFromTrustedApplication(tripId: string, userId: string): Promise<void> {
    await this.prisma.tripCollaborator.upsert({
      where: { tripId_userId: { tripId, userId } },
      create: {
        id: randomUUID(),
        tripId,
        userId,
        role: 'member',
        updatedAt: new Date(),
      },
      update: {
        role: 'member',
        updatedAt: new Date(),
      },
    });

    await this.syncFromCollaborator(tripId, userId, 'member');
  }

  async leaveFromTrustedApplication(tripId: string, userId: string): Promise<void> {
    await this.prisma.projectMembership.updateMany({
      where: { tripId, userId, status: 'ACTIVE' },
      data: { status: 'WITHDRAWN' },
    });

    await this.prisma.tripCollaborator.deleteMany({
      where: { tripId, userId, role: 'member' },
    });
  }

  async backfillFromTripCollaborators(limit = 500): Promise<{ processed: number; synced: number }> {
    const rows = await this.prisma.tripCollaborator.findMany({
      take: limit,
      orderBy: { createdAt: 'asc' },
    });

    let synced = 0;
    for (const row of rows) {
      await this.syncFromCollaborator(row.tripId, row.userId, row.role);
      synced += 1;
    }

    return { processed: rows.length, synced };
  }
}
