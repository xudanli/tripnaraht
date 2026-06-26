import { PreferenceEvolutionService } from './preference-evolution.service';
import { DecisionDnaComplianceService } from '../memory/governance/decision-dna-compliance.service';

describe('PreferenceEvolutionService compliance gating', () => {
  it('skips sync when implicit consent missing', async () => {
    const learner = { syncPreferenceToProfile: jest.fn().mockResolvedValue(null) };
    const compliance = new DecisionDnaComplianceService({
      userProfile: { findUnique: jest.fn().mockResolvedValue({ preferences: {} }) },
    } as any);
    const svc = new PreferenceEvolutionService(learner as any, compliance);

    svc.scheduleDecisionDnaSync({ userId: 'u1', reason: 'NEGOTIATION_ROLLED_BACK', throttleMs: 0 });
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 20));

    expect(learner.syncPreferenceToProfile).not.toHaveBeenCalled();
    expect(compliance.getRecentAudits(5).some((e) => !e.allowed)).toBe(true);
  });

  it('runs sync for explicit signals', async () => {
    const learner = { syncPreferenceToProfile: jest.fn().mockResolvedValue({ version: 1 }) };
    const compliance = new DecisionDnaComplianceService({
      userProfile: { findUnique: jest.fn() },
    } as any);
    const svc = new PreferenceEvolutionService(learner as any, compliance);

    svc.scheduleDecisionDnaSync({ userId: 'u1', reason: 'NEGOTIATION_CONFIRMED', throttleMs: 0 });
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 20));

    expect(learner.syncPreferenceToProfile).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', reason: 'NEGOTIATION_CONFIRMED' }),
    );
  });
});
