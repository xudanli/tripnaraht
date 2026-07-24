import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isResearchPaymentEnabled } from './research-payment.config';

export type ResearchCommitmentType =
  | 'NOTIFY_ME'
  | 'SELF_CHECK'
  | 'PRICE_LOCK'
  | 'DEPOSIT';

export interface SubmitCommitmentInput {
  commitmentType: ResearchCommitmentType;
  email?: string;
  phone?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class ResearchCommitmentService {
  constructor(private readonly prisma: PrismaService) {}

  async submitCommitment(
    sessionId: string,
    userId: string,
    input: SubmitCommitmentInput,
  ) {
    const session = await this.prisma.productDiscoverySession.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.userId !== userId) {
      throw new NotFoundException(`Research session ${sessionId} not found`);
    }

    this.validateCommitment(input);

    if (input.commitmentType === 'NOTIFY_ME') {
      await this.upsertContact(sessionId, input.email, input.phone);
    }

    const commitment = await this.prisma.productDiscoveryCommitment.create({
      data: {
        sessionId,
        commitmentType: input.commitmentType,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    if (input.commitmentType === 'SELF_CHECK' || input.commitmentType === 'NOTIFY_ME') {
      await this.prisma.productDiscoverySession.update({
        where: { id: sessionId },
        data: {
          completedAt: new Date(),
          metadata: {
            ...((session.metadata as object) ?? {}),
            commitmentType: input.commitmentType,
            commitmentId: commitment.id,
          } as Prisma.InputJsonValue,
        },
      });
    }

    return {
      commitmentId: commitment.id,
      commitmentType: input.commitmentType,
      sessionId,
      message: commitmentMessage(input.commitmentType),
    };
  }

  /** Sprint 4B — 支付成功后由 ResearchPaymentService 调用 */
  async recordPaymentCommitment(
    sessionId: string,
    userId: string,
    input: SubmitCommitmentInput,
  ) {
    if (input.commitmentType !== 'DEPOSIT' && input.commitmentType !== 'PRICE_LOCK') {
      throw new BadRequestException('recordPaymentCommitment only supports DEPOSIT and PRICE_LOCK');
    }

    const session = await this.prisma.productDiscoverySession.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.userId !== userId) {
      throw new NotFoundException(`Research session ${sessionId} not found`);
    }

    const commitment = await this.prisma.productDiscoveryCommitment.create({
      data: {
        sessionId,
        commitmentType: input.commitmentType,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    await this.prisma.productDiscoverySession.update({
      where: { id: sessionId },
      data: {
        completedAt: new Date(),
        metadata: {
          ...((session.metadata as object) ?? {}),
          commitmentType: input.commitmentType,
          commitmentId: commitment.id,
        } as Prisma.InputJsonValue,
      },
    });

    return {
      commitmentId: commitment.id,
      commitmentType: input.commitmentType,
      sessionId,
      message: commitmentMessage(input.commitmentType),
    };
  }

  private validateCommitment(input: SubmitCommitmentInput) {
    if (input.commitmentType === 'NOTIFY_ME') {
      if (!input.email && !input.phone) {
        throw new BadRequestException('NOTIFY_ME requires email or phone');
      }
    }

    if (input.commitmentType === 'DEPOSIT' || input.commitmentType === 'PRICE_LOCK') {
      if (!isResearchPaymentEnabled()) {
        throw new BadRequestException(
          `${input.commitmentType} is Sprint 4B — not enabled in current environment`,
        );
      }
      throw new BadRequestException(
        `Use POST /research/sessions/:sessionId/payments/deposit/* or /price-lock for ${input.commitmentType}`,
      );
    }
  }

  private async upsertContact(sessionId: string, email?: string, phone?: string) {
    if (!email && !phone) return;

    await this.prisma.researchContactInfo.upsert({
      where: { sessionId },
      create: { sessionId, email: email ?? null, phone: phone ?? null },
      update: {
        ...(email !== undefined ? { email } : {}),
        ...(phone !== undefined ? { phone } : {}),
      },
    });
  }
}

function commitmentMessage(type: ResearchCommitmentType): string {
  switch (type) {
    case 'NOTIFY_ME':
      return '已记录你的通知偏好；产品上线后将按研究协议联系你。';
    case 'SELF_CHECK':
      return '已记录你选择自行检查；感谢参与本次研究。';
    case 'DEPOSIT':
      return '可退订金已确认；你可在研究结束后随时申请全额退款。';
    case 'PRICE_LOCK':
      return '已记录你的价格锁定意向；正式产品上线后将另行通知。';
    default:
      return '承诺已记录';
  }
}
