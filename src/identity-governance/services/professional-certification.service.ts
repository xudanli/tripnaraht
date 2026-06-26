import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  assertProfessionalCertTransition,
  PROFESSIONAL_CERT_VALIDITY_YEARS,
  ProfessionalCertStatus,
} from '../constants/professional-certification.constants';
import { IdentityAuditLogService } from './audit-log.service';

export type ProfessionalMaterialsInput = {
  bio?: string;
  destinations?: string[];
  yearsOfExperience?: number;
  experienceSummary?: string;
  qualifications?: Array<Record<string, unknown>>;
  businessCompliance?: Record<string, unknown>;
  insurance?: Record<string, unknown>;
};

export type ProfessionalReviewAction = 'approve' | 'reject' | 'need_more_info' | 'suspend' | 'revoke';

@Injectable()
export class ProfessionalCertificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: IdentityAuditLogService,
  ) {}

  async getLatestForUser(userId: string) {
    return this.prisma.professionalCertification.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getStatus(userId: string) {
    const [profile, certification] = await Promise.all([
      this.prisma.professionalProfile.findUnique({ where: { userId } }),
      this.getLatestForUser(userId),
    ]);

    return {
      profile,
      certification,
      isVerifiedProfessional: certification?.status === 'VERIFIED',
    };
  }

  async saveDraft(userId: string, materials: ProfessionalMaterialsInput) {
    await this.upsertProfile(userId, materials);

    const existing = await this.getLatestForUser(userId);
    const currentStatus = (existing?.status ?? 'NOT_STARTED') as ProfessionalCertStatus;

    if (existing) {
      if (!['NOT_STARTED', 'DRAFT', 'NEED_MORE_INFO', 'REJECTED'].includes(currentStatus)) {
        throw new BadRequestException(`当前状态 ${currentStatus} 不可编辑材料`);
      }

      let targetStatus: ProfessionalCertStatus = currentStatus;
      if (currentStatus === 'NOT_STARTED' || currentStatus === 'REJECTED') {
        assertProfessionalCertTransition(currentStatus, 'DRAFT');
        targetStatus = 'DRAFT';
      }

      const updated = await this.prisma.professionalCertification.update({
        where: { id: existing.id },
        data: {
          status: targetStatus,
          materials: materials as Prisma.InputJsonValue,
        },
      });
      await this.auditLog.record({
        actorId: userId,
        action: 'PROFESSIONAL_CERT_DRAFT_SAVED',
        targetType: 'PROFESSIONAL_CERTIFICATION',
        targetId: updated.id,
        after: { status: updated.status },
      });
      return updated;
    }

    assertProfessionalCertTransition('NOT_STARTED', 'DRAFT');
    const created = await this.prisma.professionalCertification.create({
      data: {
        userId,
        status: 'DRAFT',
        materials: materials as Prisma.InputJsonValue,
      },
    });
    await this.auditLog.record({
      actorId: userId,
      action: 'PROFESSIONAL_CERT_DRAFT_CREATED',
      targetType: 'PROFESSIONAL_CERTIFICATION',
      targetId: created.id,
      after: { status: created.status },
    });
    return created;
  }

  async submit(userId: string) {
    const existing = await this.getLatestForUser(userId);
    if (!existing) {
      throw new BadRequestException('请先保存认证材料草稿');
    }

    const currentStatus = existing.status as ProfessionalCertStatus;
    if (!['DRAFT', 'NEED_MORE_INFO'].includes(currentStatus)) {
      throw new BadRequestException(`当前状态 ${currentStatus} 不可提交`);
    }

    assertProfessionalCertTransition(currentStatus, 'SUBMITTED');
    assertProfessionalCertTransition('SUBMITTED', 'UNDER_REVIEW');

    const updated = await this.prisma.professionalCertification.update({
      where: { id: existing.id },
      data: {
        status: 'UNDER_REVIEW',
        submittedAt: new Date(),
        reviewNotes: null,
      },
    });

    await this.ensureProfessionalContext(userId);

    await this.auditLog.record({
      actorId: userId,
      action: 'PROFESSIONAL_CERT_SUBMITTED',
      targetType: 'PROFESSIONAL_CERTIFICATION',
      targetId: updated.id,
      after: { status: updated.status },
    });

    return updated;
  }

  async listForReview(status = 'UNDER_REVIEW', limit = 50) {
    return this.prisma.professionalCertification.findMany({
      where: { status },
      orderBy: { submittedAt: 'asc' },
      take: limit,
      include: {
        User: {
          select: { id: true, email: true, displayName: true },
        },
      },
    });
  }

  async review(
    adminId: string,
    certificationId: string,
    action: ProfessionalReviewAction,
    notes?: string,
  ) {
    const cert = await this.prisma.professionalCertification.findUnique({
      where: { id: certificationId },
    });
    if (!cert) {
      throw new NotFoundException('认证申请不存在');
    }

    const from = cert.status as ProfessionalCertStatus;
    let to: ProfessionalCertStatus;
    switch (action) {
      case 'approve':
        to = 'VERIFIED';
        break;
      case 'reject':
        to = 'REJECTED';
        break;
      case 'need_more_info':
        to = 'NEED_MORE_INFO';
        break;
      case 'suspend':
        to = 'SUSPENDED';
        break;
      case 'revoke':
        to = 'REVOKED';
        break;
      default:
        throw new BadRequestException('未知审核动作');
    }

    assertProfessionalCertTransition(from, to);

    const now = new Date();
    const expiresAt =
      to === 'VERIFIED'
        ? new Date(now.getFullYear() + PROFESSIONAL_CERT_VALIDITY_YEARS, now.getMonth(), now.getDate())
        : cert.expiresAt;

    const updated = await this.prisma.professionalCertification.update({
      where: { id: cert.id },
      data: {
        status: to,
        reviewNotes: notes ?? null,
        reviewedById: adminId,
        verifiedAt: to === 'VERIFIED' ? now : cert.verifiedAt,
        expiresAt,
      },
    });

    if (to === 'VERIFIED') {
      await this.ensureProfessionalContext(cert.userId);
    }

    await this.auditLog.record({
      actorId: adminId,
      action: `PROFESSIONAL_CERT_${action.toUpperCase()}`,
      targetType: 'PROFESSIONAL_CERTIFICATION',
      targetId: cert.id,
      before: { status: from },
      after: { status: to, reviewNotes: notes ?? null },
    });

    return updated;
  }

  private async upsertProfile(userId: string, materials: ProfessionalMaterialsInput) {
    await this.prisma.professionalProfile.upsert({
      where: { userId },
      create: {
        userId,
        bio: materials.bio ?? null,
        destinations: materials.destinations ?? [],
        yearsOfExperience: materials.yearsOfExperience ?? null,
        metadata: {
          experienceSummary: materials.experienceSummary,
        } as Prisma.InputJsonValue,
      },
      update: {
        bio: materials.bio ?? null,
        destinations: materials.destinations ?? [],
        yearsOfExperience: materials.yearsOfExperience ?? null,
        metadata: {
          experienceSummary: materials.experienceSummary,
        } as Prisma.InputJsonValue,
      },
    });
  }

  private async ensureProfessionalContext(userId: string) {
    const existing = await this.prisma.userAccountContext.findFirst({
      where: { userId, contextType: 'professional' },
    });
    if (existing) return;

    await this.prisma.userAccountContext.create({
      data: {
        userId,
        contextType: 'professional',
        isActive: false,
      },
    });
  }
}
