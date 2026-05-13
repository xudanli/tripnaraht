import { ReadinessAssessSkill } from './readiness-assess.skill';
import { PolicyResolveSkill } from './policy-resolve.skill';
import { DecisionCompressSkill } from './decision-compress.skill';
import { OperationalSeverity } from '../../world/contracts/operational-severity.contract';

describe('Runtime OS P0 skills', () => {
  it('readiness.assess blocks 2WD on F-road', async () => {
    const s = new ReadinessAssessSkill();
    const r = await s.execute({
      vehicle: { drivetrain: '2WD' },
      route: { includesFRoad: true },
    });
    expect(r.executable).toBe(false);
    expect(r.blockers.length).toBeGreaterThan(0);
  });

  it('policy.resolve merges readiness into riskPolicy', async () => {
    const s = new PolicyResolveSkill();
    const p = await s.execute({
      operationalWorldState: {
        operationalRisk: 'medium',
        blockingFactors: [],
        warnings: ['x'],
        recommendedPolicies: ['y'],
        confidence: 0.7,
      },
      readiness: { executable: true, blockers: [], warnings: [], mitigationActions: [] },
    });
    expect(p.riskPolicy.operationalRisk).toBe('medium');
    expect(p.routePolicy.allowFRoads).toBe(true);
  });

  it('policy.resolve writes executionPolicyHook when operationalArbitration is blocked', async () => {
    const s = new PolicyResolveSkill();
    const p = await s.execute({
      operationalWorldState: {
        operationalRisk: 'low',
        blockingFactors: [],
        warnings: [],
        recommendedPolicies: [],
        confidence: 0.9,
      },
      operationalArbitration: {
        executionStatus: 'blocked',
        blockingReasons: ['safetravel_gate:BLOCK'],
        recommendedActions: [],
        enforcedPolicies: [],
        confidence: 0.55,
        rawSeverity: OperationalSeverity.BLOCKED,
      },
    });
    expect(p.executionPolicyHook?.executionStatus).toBe('blocked');
    expect(p.executionPolicyHook?.denyLongDistanceAutorouting).toBe(true);
    expect(p.executionPolicyHook?.haltAutomatedExecution).toBe(true);
    expect(p.routePolicy.allowFRoads).toBe(false);
    expect(p.executionPolicyHook?.causedByPolicies?.length).toBeGreaterThan(0);
    expect(Object.isFrozen(p.executionPolicyHook)).toBe(true);
  });

  it('decision.compress extracts stable and rejected signals', async () => {
    const s = new DecisionCompressSkill();
    const m = await s.execute({
      toolResults: [
        { tool: 'a', ok: true, summary: 'route valid open' },
        { tool: 'b', ok: false, summary: 'rejected plan' },
      ],
    });
    expect(m.rejectedOptions.length).toBeGreaterThan(0);
    expect(m.stableFacts.some((f) => f.includes('ok_signal'))).toBe(true);
  });
});
