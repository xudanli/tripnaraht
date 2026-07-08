import { ResearchCommitmentService } from './research-commitment.service';

describe('ResearchCommitmentService', () => {
  const prisma = {
    productDiscoverySession: {
      findUnique: jest.fn(async () => ({
        id: 'session_1',
        userId: 'user_1',
        metadata: {},
      })),
      update: jest.fn(async () => ({})),
    },
    productDiscoveryCommitment: {
      create: jest.fn(async (args: { data: { commitmentType: string } }) => ({
        id: 'commit_1',
        ...args.data,
      })),
    },
    researchContactInfo: {
      upsert: jest.fn(async () => ({})),
    },
  };

  let service: ResearchCommitmentService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ResearchCommitmentService(prisma as any);
  });

  it('accepts NOTIFY_ME with email and stores contact separately', async () => {
    const result = await service.submitCommitment('session_1', 'user_1', {
      commitmentType: 'NOTIFY_ME',
      email: 'test@example.com',
    });
    expect(result.commitmentType).toBe('NOTIFY_ME');
    expect(prisma.researchContactInfo.upsert).toHaveBeenCalled();
  });

  it('accepts SELF_CHECK without contact', async () => {
    const result = await service.submitCommitment('session_1', 'user_1', {
      commitmentType: 'SELF_CHECK',
    });
    expect(result.commitmentType).toBe('SELF_CHECK');
    expect(prisma.researchContactInfo.upsert).not.toHaveBeenCalled();
  });

  it('rejects DEPOSIT via public commitments endpoint', async () => {
    const prev = process.env.RESEARCH_PAYMENT_COMMITMENT_ENABLED;
    process.env.RESEARCH_PAYMENT_COMMITMENT_ENABLED = '1';
    try {
      await expect(
        service.submitCommitment('session_1', 'user_1', {
          commitmentType: 'DEPOSIT',
        }),
      ).rejects.toThrow(/payments\/deposit/);
    } finally {
      if (prev === undefined) delete process.env.RESEARCH_PAYMENT_COMMITMENT_ENABLED;
      else process.env.RESEARCH_PAYMENT_COMMITMENT_ENABLED = prev;
    }
  });
});
