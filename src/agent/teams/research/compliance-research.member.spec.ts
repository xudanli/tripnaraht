import { ComplianceResearchMember } from './compliance-research.member';
import { SkillsRegistryService } from '../../../skills/services/skills-registry.service';

describe('ComplianceResearchMember', () => {
  it('skips safetravel for non-Iceland trip', async () => {
    const getSkill = jest.fn();
    const skills = { getSkill } as unknown as SkillsRegistryService;
    const m = new ComplianceResearchMember(skills);
    const researchData: Record<string, unknown> = {};
    const evidenceRefs: string[] = [];
    await m.runComplianceResearch({
      requestId: 'r1',
      tripPlanRequest: { destination: 'Tokyo', date_range: { start_date: '2026-06-01', end_date: '2026-06-03' } },
      researchData,
      evidenceRefs,
    });
    expect(getSkill).not.toHaveBeenCalled();
    expect(researchData.safetravel_advisories).toBeUndefined();
  });

  it('runs safetravel.get_advisories for Iceland string destination', async () => {
    const stOut = {
      alerts: [],
      rss_refined: [],
      safetravel_alerts: [],
      lastUpdated: 't',
      source: 'safetravel.is/feed',
      gate_recommendation: 'ALLOW',
      summary: 'ok',
    };
    const execute = jest.fn().mockResolvedValue(stOut);
    const getSkill = jest.fn().mockReturnValue({ execute });
    const skills = { getSkill } as unknown as SkillsRegistryService;
    const m = new ComplianceResearchMember(skills);
    const researchData: Record<string, unknown> = {};
    const evidenceRefs: string[] = [];
    await m.runComplianceResearch({
      requestId: 'r1',
      tripPlanRequest: { destination: 'Iceland south coast', date_range: { start_date: '2026-06-01', end_date: '2026-06-03' } },
      researchData,
      evidenceRefs,
    });
    expect(execute).toHaveBeenCalled();
    expect(researchData.safetravel_advisories).toEqual(stOut);
    expect(researchData.safetravel_gate_recommendation).toBe('ALLOW');
    expect(evidenceRefs.length).toBeGreaterThan(0);
  });
});
