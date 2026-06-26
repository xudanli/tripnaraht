import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AssignPrivacyAnalystDto,
  CreateSanitizedConstraintDto,
  ReadPrivateConstraintDto,
  ReviewSanitizedConstraintDto,
} from '../dto/gate1.dto';
import { Gate1CryptoService } from './gate1-crypto.service';
import { Gate1AnalyticsService, Gate1GuardService } from './gate1-support.services';
import { Gate1RuntimeEventService } from '../../decision-runtime/services/gate1-runtime-event.service';
import type { Gate1RuntimeEmitResult } from '../../decision-runtime/types/gate1-runtime-emit.types';

@Injectable()
export class Gate1PrivacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guard: Gate1GuardService,
    private readonly crypto: Gate1CryptoService,
    private readonly analytics: Gate1AnalyticsService,
    private readonly runtimeEvents: Gate1RuntimeEventService,
  ) {}

  async assignAnalyst(projectId: string, grantedBy: string, dto: AssignPrivacyAnalystDto) {
    await this.guard.requireProject(projectId);
    const active = await this.prisma.gate1PrivacyAnalystAssignment.count({
      where: {
        projectId,
        revokedAt: null,
        endsAt: { gt: new Date() },
      },
    });
    if (active >= 2) {
      throw new BadRequestException('At most 2 privacy analysts per project (FR-PRI-01)');
    }
    return this.prisma.gate1PrivacyAnalystAssignment.create({
      data: {
        projectId,
        analystId: dto.analystId,
        grantedBy,
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
      },
    });
  }

  private async assertAnalyst(projectId: string, analystId: string) {
    const assignment = await this.prisma.gate1PrivacyAnalystAssignment.findFirst({
      where: {
        projectId,
        analystId,
        revokedAt: null,
        startsAt: { lte: new Date() },
        endsAt: { gt: new Date() },
      },
    });
    if (!assignment) {
      throw new ForbiddenException('Not an authorized privacy analyst for this project');
    }
    return assignment;
  }

  private async audit(
    projectId: string,
    actorId: string,
    action: string,
    resourceType: string,
    resourceId?: string,
    fieldKey?: string,
    reason?: string,
  ) {
    await this.prisma.gate1AccessAuditLog.create({
      data: {
        projectId,
        actorId,
        action,
        resourceType,
        resourceId: resourceId ?? null,
        fieldKey: fieldKey ?? null,
        reason: reason ?? null,
      },
    });
  }

  async listPrivateConstraints(projectId: string, analystId: string, dto: ReadPrivateConstraintDto) {
    await this.assertAnalyst(projectId, analystId);
    const rows = await this.prisma.gate1PrivateConstraint.findMany({
      where: {
        status: 'ACTIVE',
        participant: { projectId },
      },
      include: { participant: { select: { id: true, displayName: true } } },
    });

    for (const row of rows) {
      await this.audit(
        projectId,
        analystId,
        'READ',
        'private_constraint',
        row.id,
        row.fieldKey,
        dto.reason,
      );
      await this.analytics.track(
        projectId,
        (await this.guard.requireProject(projectId)).cohort,
        'private_constraint_accessed',
        {
          actorId: analystId,
          participantId: row.participantId,
          properties: { fieldKey: row.fieldKey },
        },
      );
      void this.runtimeEvents.sensitiveDataAccessed({
        projectId,
        actorId: analystId,
        resourceType: 'private_constraint',
        resourceId: row.id,
        fieldKey: row.fieldKey,
        reason: dto.reason,
      });
    }

    return rows.map((row) => ({
      id: row.id,
      participantId: row.participantId,
      participantLabel: row.participant.displayName,
      fieldKey: row.fieldKey,
      authorizationLevel: row.authorizationLevel,
      decryptedValue: this.crypto.decrypt(row.encryptedValue),
    }));
  }

  async createSanitized(projectId: string, analystId: string, dto: CreateSanitizedConstraintDto) {
    await this.assertAnalyst(projectId, analystId);
    return this.prisma.gate1SanitizedConstraint.create({
      data: {
        projectId,
        participantId: dto.participantId ?? null,
        explanation: dto.explanation,
        impactSummary: dto.impactSummary ?? null,
        reviewStatus: 'PENDING',
        createdBy: analystId,
      },
    });
  }

  async reviewSanitized(
    projectId: string,
    constraintId: string,
    reviewerId: string,
    dto: ReviewSanitizedConstraintDto,
  ) {
    const staged: Gate1RuntimeEmitResult[] = [];

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.gate1SanitizedConstraint.update({
        where: { id: constraintId },
        data: {
          reviewStatus: dto.reviewStatus,
          reviewedBy: reviewerId,
          reviewedAt: new Date(),
        },
      });

      const emitResult = await this.runtimeEvents.privateConstraintSummarized({
        projectId,
        sanitizedConstraintId: constraintId,
        actorId: reviewerId,
        reviewStatus: dto.reviewStatus,
        tx,
      });
      if (emitResult) staged.push(emitResult);

      return row;
    });

    this.runtimeEvents.flushStaged(staged);

    return updated;
  }

  async listSanitizedForAdvisor(projectId: string) {
    return this.prisma.gate1SanitizedConstraint.findMany({
      where: { projectId, reviewStatus: 'APPROVED' },
      select: {
        id: true,
        explanation: true,
        impactSummary: true,
        reviewedAt: true,
      },
    });
  }
}
