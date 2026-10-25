import {
  buildFeasibilityIssuesFromBoundRisks,
  collectConstraintTemplateIdsFromRisks,
  resolveRiskConstraintBindingSync,
  severityLevelForBinding,
} from './risk-constraint-binding-runtime.util';

describe('risk-constraint-binding-runtime.util', () => {
  it('resolves ENV-WIND-01 STOP to official wind safety template', () => {
    const attachment = resolveRiskConstraintBindingSync({
      knowledgeCode: 'ENV-WIND-01',
      severityLevel: 'STOP',
    });
    expect(attachment?.primaryTemplateId).toBe('c_official_is_wind_safety');
    expect(attachment?.anyBlocked).toBe(true);
    expect(attachment?.feasibilityDimension).toBe('environment');
  });

  it('maps executionGate to binding severity level', () => {
    expect(severityLevelForBinding({ executionGate: 'REPLAN' })).toBe('REPLAN_REQUIRED');
    expect(severityLevelForBinding({ executionGate: 'ALLOW' })).toBeNull();
  });

  it('builds feasibility issues from bound risks', () => {
    const binding = resolveRiskConstraintBindingSync({
      knowledgeCode: 'ENV-WIND-01',
      severityLevel: 'STOP',
    });
    const issues = buildFeasibilityIssuesFromBoundRisks([
      {
        id: 'risk-1',
        knowledgeCode: 'ENV-WIND-01',
        title: '强风',
        summary: '持续强风',
        executionGate: 'STOP',
        constraintBinding: binding,
      },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.priority).toBe('must_handle');
    expect(issues[0]?.relatedConstraintIds).toContain('c_official_is_wind_safety');
    expect(issues[0]?.issueKind).toBe('risk_constraint_binding');
  });

  it('collects template ids from risks', () => {
    const binding = resolveRiskConstraintBindingSync({
      knowledgeCode: 'ENV-LIGHT-01',
      severityLevel: 'REPLAN_REQUIRED',
    });
    expect(
      collectConstraintTemplateIdsFromRisks([{ constraintBinding: binding }]),
    ).toContain('c_no_night_drive');
  });
});
