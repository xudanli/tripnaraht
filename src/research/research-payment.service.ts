import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StripeDirectService } from '../mcp/stripe-direct.service';
import {
  RESEARCH_DEPOSIT_SKU,
  RESEARCH_PAYMENT_LEGAL,
  assertResearchPaymentEnabled,
  isResearchPaymentSandboxMode,
} from './research-payment.config';
import { ResearchCommitmentService } from './research-commitment.service';

@Injectable()
export class ResearchPaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commitments: ResearchCommitmentService,
    @Optional() private readonly stripe?: StripeDirectService,
  ) {}

  getPaymentCatalog() {
    assertResearchPaymentEnabled();
    return {
      legal: RESEARCH_PAYMENT_LEGAL,
      depositSku: RESEARCH_DEPOSIT_SKU,
      sandboxMode: isResearchPaymentSandboxMode(),
    };
  }

  async startDeposit(sessionId: string, userId: string) {
    assertResearchPaymentEnabled();
    await this.requireSession(sessionId, userId);

    const existing = await this.prisma.researchPaymentRecord.findFirst({
      where: {
        sessionId,
        paymentKind: 'RESEARCH_DEPOSIT',
        status: { in: ['PENDING', 'REQUIRES_ACTION', 'SUCCEEDED'] },
      },
    });
    if (existing?.status === 'SUCCEEDED') {
      return this.formatDepositResponse(existing);
    }
    if (existing?.status === 'PENDING' || existing?.status === 'REQUIRES_ACTION') {
      return this.formatDepositResponse(existing);
    }

    let stripePaymentIntentId: string | null = null;
    let clientSecret: string | null = null;
    let status = 'PENDING';

    if (this.stripe?.isServiceAvailable()) {
      const pi = await this.stripe.createPaymentIntent({
        userId,
        amount: RESEARCH_DEPOSIT_SKU.amountCents,
        currency: RESEARCH_DEPOSIT_SKU.currency,
        metadata: {
          skuId: RESEARCH_DEPOSIT_SKU.skuId,
          sessionId,
          paymentKind: 'RESEARCH_DEPOSIT',
        },
      });
      stripePaymentIntentId = pi.id;
      clientSecret = pi.client_secret ?? null;
      status = pi.status === 'requires_payment_method' ? 'REQUIRES_ACTION' : pi.status;
    } else if (isResearchPaymentSandboxMode()) {
      stripePaymentIntentId = `sandbox_pi_${sessionId.slice(0, 8)}`;
      clientSecret = `sandbox_secret_${sessionId.slice(0, 8)}`;
      status = 'REQUIRES_ACTION';
    } else {
      throw new ServiceUnavailableException(
        'Stripe is not configured; set STRIPE_SECRET_KEY or RESEARCH_PAYMENT_SANDBOX_MODE=1',
      );
    }

    const record = await this.prisma.researchPaymentRecord.create({
      data: {
        sessionId,
        userId,
        paymentKind: 'RESEARCH_DEPOSIT',
        skuId: RESEARCH_DEPOSIT_SKU.skuId,
        amountCents: RESEARCH_DEPOSIT_SKU.amountCents,
        currency: RESEARCH_DEPOSIT_SKU.currency,
        status,
        stripePaymentIntentId,
        clientSecret,
        metadata: { sandbox: isResearchPaymentSandboxMode() } as Prisma.InputJsonValue,
      },
    });

    return this.formatDepositResponse(record);
  }

  /** 沙箱或前端 Stripe 完成后同步状态 */
  async confirmDeposit(sessionId: string, userId: string) {
    assertResearchPaymentEnabled();
    await this.requireSession(sessionId, userId);

    const record = await this.requireDepositRecord(sessionId);
    if (record.status === 'SUCCEEDED') {
      return this.afterDepositSucceeded(record);
    }
    if (record.status === 'REFUNDED') {
      throw new BadRequestException('Deposit already refunded');
    }

    if (record.metadata && (record.metadata as Record<string, unknown>).sandbox === true) {
      const updated = await this.prisma.researchPaymentRecord.update({
        where: { id: record.id },
        data: { status: 'SUCCEEDED' },
      });
      return this.afterDepositSucceeded(updated);
    }

    if (!record.stripePaymentIntentId || !this.stripe?.isServiceAvailable()) {
      throw new ServiceUnavailableException('Cannot confirm deposit without Stripe');
    }

    const pi = await this.stripe.getPaymentIntent(record.stripePaymentIntentId);
    const status = pi.status === 'succeeded' ? 'SUCCEEDED' : pi.status.toUpperCase();

    const updated = await this.prisma.researchPaymentRecord.update({
      where: { id: record.id },
      data: { status },
    });

    if (status === 'SUCCEEDED') {
      return this.afterDepositSucceeded(updated);
    }

    return this.formatDepositResponse(updated);
  }

  async refundDeposit(sessionId: string, userId: string) {
    assertResearchPaymentEnabled();
    await this.requireSession(sessionId, userId);

    const record = await this.requireDepositRecord(sessionId);
    if (record.status !== 'SUCCEEDED') {
      throw new BadRequestException('Only succeeded deposits can be refunded');
    }

    const isSandbox = (record.metadata as Record<string, unknown>)?.sandbox === true;

    if (!isSandbox && record.stripePaymentIntentId && this.stripe?.isServiceAvailable()) {
      await this.stripe.refundPayment(record.stripePaymentIntentId, undefined, 'requested_by_customer');
    }

    const updated = await this.prisma.researchPaymentRecord.update({
      where: { id: record.id },
      data: { status: 'REFUNDED', refundedAt: new Date() },
    });

    return {
      paymentRecordId: updated.id,
      status: updated.status,
      refundedAt: updated.refundedAt?.toISOString(),
      message: RESEARCH_PAYMENT_LEGAL.depositBody,
    };
  }

  async submitPriceLock(
    sessionId: string,
    userId: string,
    input: { lockedPriceUsd: number; email?: string; phone?: string },
  ) {
    assertResearchPaymentEnabled();
    await this.requireSession(sessionId, userId);

    if (input.lockedPriceUsd <= 0) {
      throw new BadRequestException('lockedPriceUsd must be positive');
    }

    if (input.email || input.phone) {
      await this.prisma.researchContactInfo.upsert({
        where: { sessionId },
        create: {
          sessionId,
          email: input.email ?? null,
          phone: input.phone ?? null,
        },
        update: {
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
        },
      });
    }

    const existing = await this.prisma.researchPaymentRecord.findFirst({
      where: { sessionId, paymentKind: 'RESEARCH_PRICE_LOCK' },
    });

    const record = existing
      ? await this.prisma.researchPaymentRecord.update({
          where: { id: existing.id },
          data: {
            priceLockUsd: input.lockedPriceUsd,
            status: 'SUCCEEDED',
          },
        })
      : await this.prisma.researchPaymentRecord.create({
          data: {
            sessionId,
            userId,
            paymentKind: 'RESEARCH_PRICE_LOCK',
            skuId: 'research_price_lock_v1',
            amountCents: 0,
            status: 'SUCCEEDED',
            priceLockUsd: input.lockedPriceUsd,
            metadata: { legal: RESEARCH_PAYMENT_LEGAL.priceLockBody } as Prisma.InputJsonValue,
          },
        });

    const commitment = await this.commitments.recordPaymentCommitment(sessionId, userId, {
      commitmentType: 'PRICE_LOCK',
      email: input.email,
      phone: input.phone,
      metadata: { lockedPriceUsd: input.lockedPriceUsd, paymentRecordId: record.id },
    });

    return {
      paymentRecordId: record.id,
      lockedPriceUsd: input.lockedPriceUsd,
      commitment,
      legal: RESEARCH_PAYMENT_LEGAL.priceLockBody,
    };
  }

  async getDepositStatus(sessionId: string, userId: string) {
    assertResearchPaymentEnabled();
    await this.requireSession(sessionId, userId);
    const record = await this.prisma.researchPaymentRecord.findFirst({
      where: { sessionId, paymentKind: 'RESEARCH_DEPOSIT' },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) {
      return { status: 'NOT_STARTED' as const };
    }
    return this.formatDepositResponse(record);
  }

  private async afterDepositSucceeded(record: {
    id: string;
    sessionId: string;
    status: string;
    stripePaymentIntentId: string | null;
    clientSecret: string | null;
    amountCents: number;
    currency: string;
  }) {
    const session = await this.prisma.productDiscoverySession.findUniqueOrThrow({
      where: { id: record.sessionId },
    });

    const commitment = await this.commitments.recordPaymentCommitment(record.sessionId, session.userId, {
      commitmentType: 'DEPOSIT',
      metadata: {
        paymentRecordId: record.id,
        stripePaymentIntentId: record.stripePaymentIntentId,
      },
    });

    return {
      ...this.formatDepositResponse({ ...record, status: 'SUCCEEDED' }),
      commitment,
    };
  }

  private formatDepositResponse(record: {
    id: string;
    status: string;
    stripePaymentIntentId: string | null;
    clientSecret: string | null;
    amountCents: number;
    currency: string;
  }) {
    return {
      paymentRecordId: record.id,
      status: record.status,
      stripePaymentIntentId: record.stripePaymentIntentId,
      clientSecret: record.clientSecret,
      amountCents: record.amountCents,
      currency: record.currency,
      displayAmount: RESEARCH_DEPOSIT_SKU.displayAmount,
      legal: RESEARCH_PAYMENT_LEGAL,
      skuId: RESEARCH_DEPOSIT_SKU.skuId,
    };
  }

  private async requireSession(sessionId: string, userId: string) {
    const session = await this.prisma.productDiscoverySession.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.userId !== userId) {
      throw new NotFoundException(`Research session ${sessionId} not found`);
    }
    return session;
  }

  private async requireDepositRecord(sessionId: string) {
    const record = await this.prisma.researchPaymentRecord.findFirst({
      where: { sessionId, paymentKind: 'RESEARCH_DEPOSIT' },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) {
      throw new NotFoundException('No deposit record for this session');
    }
    return record;
  }
}
