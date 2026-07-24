import {
  CANONICAL_PROBLEM_AI_CONTRACT,
  DECISION_CASE_AI_CONTRACTS,
  getDecisionCaseAIContract,
  listDecisionCaseAIContracts,
  preferredInsightModeForCase,
  shouldCaseProactivelySurface,
  UI_GROUP_AI_POLICY,
} from '../contracts/decision-case-ai-contracts';

describe('DecisionCaseAIContract registry', () => {
  it('registers eight Iceland P0 cases', () => {
    expect(listDecisionCaseAIContracts()).toHaveLength(8);
    expect(DECISION_CASE_AI_CONTRACTS['REQUIRED_CHOICE.VEHICLE_ROAD_FIT'].aiMode).toBe(
      'EXPLAIN_AND_RECOMMEND',
    );
    expect(DECISION_CASE_AI_CONTRACTS['OPPORTUNITY.GLACIER_EXPERIENCE'].proactiveMode).toBe(
      'WHEN_MATCHED',
    );
    expect(
      DECISION_CASE_AI_CONTRACTS['RULE_TRIGGER.FROAD_VEHICLE_MISMATCH'].aiMode,
    ).toBe('INTERVENTION');
  });

  it('resolves by problemId prefix', () => {
    expect(
      getDecisionCaseAIContract({ problemId: 'dc_vehicle_abc' }).semanticKey,
    ).toBe('REQUIRED_CHOICE.VEHICLE_ROAD_FIT');
    expect(
      getDecisionCaseAIContract({ problemId: 'dc_glacier_abc' }).semanticKey,
    ).toBe('OPPORTUNITY.GLACIER_EXPERIENCE');
  });

  it('falls back to canonical EXPLAIN_ONLY', () => {
    const c = getDecisionCaseAIContract({ hasDecisionCase: false });
    expect(c.aiMode).toBe('EXPLAIN_ONLY');
    expect(c.semanticKey).toBe(CANONICAL_PROBLEM_AI_CONTRACT.semanticKey);
  });

  it('uiGroup policy is separate from semanticKey', () => {
    expect(UI_GROUP_AI_POLICY.MUST_CONFIRM.defaultProactive).toBe('INTERVENTION');
    expect(UI_GROUP_AI_POLICY.IMPORTANT_CHOICE.defaultProactive).toBe('ATTENTION');
    expect(UI_GROUP_AI_POLICY.CANONICAL.aiRole).toContain('不创造');
  });

  it('glacier stays non-proactive until matched', () => {
    const contract = DECISION_CASE_AI_CONTRACTS['OPPORTUNITY.GLACIER_EXPERIENCE'];
    expect(
      shouldCaseProactivelySurface({
        contract,
        explicitAsk: false,
        highImpact: false,
        matchedOrGated: false,
      }),
    ).toBe(false);
    expect(
      shouldCaseProactivelySurface({
        contract,
        explicitAsk: false,
        highImpact: false,
        matchedOrGated: true,
      }),
    ).toBe(true);
  });

  it('F-road mismatch prefers INTERVENTION', () => {
    expect(
      preferredInsightModeForCase({
        contract: DECISION_CASE_AI_CONTRACTS['RULE_TRIGGER.FROAD_VEHICLE_MISMATCH'],
        uiGroup: 'MUST_CONFIRM',
        highImpact: true,
      }),
    ).toBe('INTERVENTION');
  });

  it('ring vs south prefers ATTENTION compare', () => {
    expect(
      preferredInsightModeForCase({
        contract: DECISION_CASE_AI_CONTRACTS['RULE_TRIGGER.RING_VS_SOUTH_SCOPE'],
        uiGroup: 'IMPORTANT_CHOICE',
        highImpact: false,
      }),
    ).toBe('ATTENTION');
  });
});
