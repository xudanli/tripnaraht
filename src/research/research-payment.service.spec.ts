import { ResearchPaymentService } from './research-payment.service';
import { ResearchCommitmentService } from './research-commitment.service';

describe('ResearchPaymentService', () => {
  const sessionId = '11111111-1111-1111-1111-111111111111';
  const userId = '22222222-2222-2222-2222-222222222222';

  const prisma = {
    productDiscoverySession: {
      findUnique: jest.fn(async () => ({ id: sessionId, userId, metadata: {} })),
      findUniqueOrThrow: jest.fn(async () => ({ id: sessionId, userId, metadata: {} })),
    },
    researchPaymentRecord: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async (args: { data: Record<string, unknown> }) => ({
        id: 'pay_1',
        ...args.data,
      })),
      update: jest.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => ({
        id: args.where.id,
        sessionId,
        userId,
        paymentKind: 'RESEARCH_DEPOSIT',
        skuId: 'research_deposit_v1',
        amountCents: 1900,
        currency: 'usd',
        stripePaymentIntentId: 'sandbox_pi_11111111',
        clientSecret: 'sandbox_secret_11111111',
        status: args.data.status ?? 'SUCCEEDED',
        ...args.data,
      })),
    },
    researchContactInfo: {
      upsert: jest.fn(async () => ({})),
    },
  };

  const commitments = {
    recordPaymentCommitment: jest.fn(async () => ({
      commitmentId: 'commit_1',
      commitmentType: 'DEPOSIT',
      sessionId,
      message: 'ok',
    })),
  };

  let service: ResearchPaymentService;
  let prevEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    jest.clearAllMocks();
    prevEnv = { ...process.env };
    process.env.RESEARCH_PAYMENT_COMMITMENT_ENABLED = '1';
    process.env.RESEARCH_PAYMENT_SANDBOX_MODE = '1';
    delete process.env.STRIPE_SECRET_KEY;
    service = new ResearchPaymentService(
      prisma as any,
      commitments as unknown as ResearchCommitmentService,
    );
  });

  afterEach(() => {
    process.env = prevEnv;
  });

  it('returns payment catalog with legal copy', () => {
    const catalog = service.getPaymentCatalog();
    expect(catalog.depositSku.skuId).toBe('research_deposit_v1');
    expect(catalog.legal.refundPolicy).toBe('UNCONDITIONAL_FULL_REFUND');
    expect(catalog.sandboxMode).toBe(true);
  });

  it('starts sandbox deposit and returns client secret', async () => {
    const result = await service.startDeposit(sessionId, userId);
    expect(result.clientSecret).toMatch(/^sandbox_secret_/);
    expect(result.amountCents).toBe(1900);
    expect(prisma.researchPaymentRecord.create).toHaveBeenCalled();
  });

  it('confirms sandbox deposit and records commitment', async () => {
    prisma.researchPaymentRecord.findFirst.mockResolvedValueOnce({
      id: 'pay_1',
      sessionId,
      userId,
      paymentKind: 'RESEARCH_DEPOSIT',
      status: 'REQUIRES_ACTION',
      stripePaymentIntentId: 'sandbox_pi_11111111',
      clientSecret: 'sandbox_secret_11111111',
      amountCents: 1900,
      currency: 'usd',
      metadata: { sandbox: true },
    });

    const result = await service.confirmDeposit(sessionId, userId);
    expect(result.status).toBe('SUCCEEDED');
    expect(commitments.recordPaymentCommitment).toHaveBeenCalledWith(
      sessionId,
      userId,
      expect.objectContaining({ commitmentType: 'DEPOSIT' }),
    );
  });

  it('refunds succeeded sandbox deposit', async () => {
    prisma.researchPaymentRecord.findFirst.mockResolvedValueOnce({
      id: 'pay_1',
      sessionId,
      status: 'SUCCEEDED',
      metadata: { sandbox: true },
      stripePaymentIntentId: 'sandbox_pi_11111111',
    });

    const result = await service.refundDeposit(sessionId, userId);
    expect(result.status).toBe('REFUNDED');
  });

  it('submits price lock without payment', async () => {
    commitments.recordPaymentCommitment.mockResolvedValueOnce({
      commitmentId: 'commit_2',
      commitmentType: 'PRICE_LOCK',
      sessionId,
      message: 'locked',
    });

    const result = await service.submitPriceLock(sessionId, userId, {
      lockedPriceUsd: 49,
      email: 'user@example.com',
    });

    expect(result.lockedPriceUsd).toBe(49);
    expect(commitments.recordPaymentCommitment).toHaveBeenCalledWith(
      sessionId,
      userId,
      expect.objectContaining({ commitmentType: 'PRICE_LOCK' }),
    );
  });
});
