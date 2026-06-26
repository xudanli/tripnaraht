import { DecisionDnaComplianceService } from './decision-dna-compliance.service';

describe('DecisionDnaComplianceService', () => {
  const prisma = {
    userProfile: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  } as any;

  let svc: DecisionDnaComplianceService;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = new DecisionDnaComplianceService(prisma);
  });

  it('allows explicit NEGOTIATION_CONFIRMED without consent', async () => {
    const gate = await svc.evaluateSync({ userId: 'u1', reason: 'NEGOTIATION_CONFIRMED' });
    expect(gate.allowed).toBe(true);
    expect(gate.tier).toBe('EXPLICIT');
  });

  it('blocks implicit ROLLBACK without consent', async () => {
    prisma.userProfile.findUnique.mockResolvedValue({ preferences: {} });
    const gate = await svc.evaluateSync({ userId: 'u1', reason: 'NEGOTIATION_ROLLED_BACK' });
    expect(gate.allowed).toBe(false);
    expect(gate.blockedReason).toBe('IMPLICIT_CONSENT_REQUIRED');
  });

  it('allows implicit signals when consent granted', async () => {
    prisma.userProfile.findUnique.mockResolvedValue({
      preferences: { decision_dna_consent: { implicit_learning: true, granted_at: '2026-01-01' } },
    });
    const gate = await svc.evaluateSync({ userId: 'u1', reason: 'NEGOTIATION_ROLLED_BACK' });
    expect(gate.allowed).toBe(true);
    expect(gate.tier).toBe('IMPLICIT_WITH_CONSENT');
  });

  it('records audit events in ring buffer', () => {
    svc.recordAudit({
      userId: 'u1',
      reason: 'NEGOTIATION_CONFIRMED',
      signalSource: 'USER_CONFIRMED_CHOICE',
      tier: 'EXPLICIT',
      allowed: true,
    });
    expect(svc.getRecentAudits(10)).toHaveLength(1);
  });

  it('updates and reads consent status', async () => {
    prisma.userProfile.findUnique
      .mockResolvedValueOnce({ preferences: {} })
      .mockResolvedValueOnce({
        preferences: {
          decision_dna_consent: { implicit_learning: true, granted_at: '2026-06-01T00:00:00.000Z' },
        },
      });
    prisma.userProfile.upsert.mockResolvedValue({});
    const status = await svc.updateConsent('u1', true);
    expect(status.implicit_learning).toBe(true);
    expect(status.granted_at).toBeDefined();
  });
});
