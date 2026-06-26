import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  VerificationStatus,
  VerificationType,
} from '../constants/identity-governance.constants';
import { IdentityAuditLogService } from './audit-log.service';

export type VerificationRecordView = {
  verificationType: VerificationType;
  status: VerificationStatus;
  provider: string | null;
  verifiedAt: Date | null;
  expiresAt: Date | null;
};

export type StartVerificationInput = {
  phone?: string;
  realName?: string;
  idNumberLast4?: string;
  birthYear?: number;
};

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: IdentityAuditLogService,
  ) {}

  async listForUser(userId: string): Promise<VerificationRecordView[]> {
    await this.syncEmailFromUser(userId);
    const rows = await this.prisma.userVerification.findMany({
      where: { userId },
      orderBy: { verificationType: 'asc' },
    });
    return rows.map((row) => ({
      verificationType: row.verificationType as VerificationType,
      status: row.status as VerificationStatus,
      provider: row.provider,
      verifiedAt: row.verifiedAt,
      expiresAt: row.expiresAt,
    }));
  }

  async getSummary(userId: string) {
    const records = await this.listForUser(userId);
    const byType = Object.fromEntries(records.map((r) => [r.verificationType, r]));
    return {
      records,
      emailVerified: byType.EMAIL?.status === 'VERIFIED',
      phoneVerified: byType.PHONE?.status === 'VERIFIED',
      realNameVerified: byType.REAL_NAME?.status === 'VERIFIED',
      ageVerified: byType.AGE?.status === 'VERIFIED',
    };
  }

  async start(userId: string, type: VerificationType, input: StartVerificationInput = {}) {
    if (type === 'EMAIL') {
      throw new BadRequestException('邮箱验证请使用 /auth 邮箱验证码流程');
    }

    const evidence = this.buildEvidence(type, input);
    const row = await this.prisma.userVerification.upsert({
      where: {
        userId_verificationType: { userId, verificationType: type },
      },
      create: {
        userId,
        verificationType: type,
        status: 'PENDING',
        provider: 'platform_manual_review',
        evidence: evidence as Prisma.InputJsonValue,
      },
      update: {
        status: 'PENDING',
        provider: 'platform_manual_review',
        evidence: evidence as Prisma.InputJsonValue,
        verifiedAt: null,
        expiresAt: null,
      },
    });

    await this.auditLog.record({
      actorId: userId,
      action: 'IDENTITY_VERIFICATION_SUBMITTED',
      targetType: 'USER_VERIFICATION',
      targetId: `${userId}:${type}`,
      after: { verificationType: type, status: 'PENDING' },
    });

    return row;
  }

  async listPendingForReview(type?: VerificationType, limit = 50) {
    return this.prisma.userVerification.findMany({
      where: {
        status: 'PENDING',
        ...(type ? { verificationType: type } : {}),
      },
      orderBy: { updatedAt: 'asc' },
      take: limit,
      select: {
        id: true,
        userId: true,
        verificationType: true,
        status: true,
        provider: true,
        evidence: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async review(
    adminId: string,
    userId: string,
    type: VerificationType,
    action: 'approve' | 'reject' | 'need_more_info',
    notes?: string,
  ) {
    const row = await this.prisma.userVerification.findUnique({
      where: {
        userId_verificationType: { userId, verificationType: type },
      },
    });
    if (!row) {
      throw new NotFoundException('验证记录不存在');
    }
    if (row.status !== 'PENDING' && row.status !== 'NEED_MORE_INFO') {
      throw new BadRequestException(`当前状态 ${row.status} 不可审核`);
    }

    const nextStatus: VerificationStatus =
      action === 'approve' ? 'VERIFIED' : action === 'reject' ? 'REJECTED' : 'NEED_MORE_INFO';

    const updated = await this.prisma.userVerification.update({
      where: { id: row.id },
      data: {
        status: nextStatus,
        verifiedAt: action === 'approve' ? new Date() : null,
        evidence: {
          ...(typeof row.evidence === 'object' && row.evidence ? (row.evidence as object) : {}),
          reviewNotes: notes ?? null,
        } as Prisma.InputJsonValue,
      },
    });

    await this.auditLog.record({
      actorId: adminId,
      action: `IDENTITY_VERIFICATION_${action.toUpperCase()}`,
      targetType: 'USER_VERIFICATION',
      targetId: row.id,
      before: { status: row.status },
      after: { status: nextStatus, reviewNotes: notes ?? null },
    });

    return updated;
  }

  private buildEvidence(type: VerificationType, input: StartVerificationInput) {
    if (type === 'PHONE') {
      if (!input.phone?.trim()) {
        throw new BadRequestException('手机号不能为空');
      }
      return { phoneMasked: this.maskPhone(input.phone.trim()) };
    }
    if (type === 'REAL_NAME') {
      if (!input.realName?.trim()) {
        throw new BadRequestException('实名信息不能为空');
      }
      return {
        realNameProvided: true,
        idNumberLast4: input.idNumberLast4?.trim() || null,
      };
    }
    if (type === 'AGE') {
      if (!input.birthYear) {
        throw new BadRequestException('出生年份不能为空');
      }
      return { birthYear: input.birthYear };
    }
    return input;
  }

  private maskPhone(phone: string): string {
    if (phone.length < 7) return '***';
    return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
  }

  private async syncEmailFromUser(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { emailVerified: true },
    });
    if (!user?.emailVerified) return;

    await this.prisma.userVerification.upsert({
      where: {
        userId_verificationType: {
          userId,
          verificationType: 'EMAIL',
        },
      },
      create: {
        userId,
        verificationType: 'EMAIL',
        status: 'VERIFIED',
        provider: 'platform_email',
        verifiedAt: new Date(),
      },
      update: {
        status: 'VERIFIED',
        provider: 'platform_email',
        verifiedAt: new Date(),
      },
    });
  }
}
