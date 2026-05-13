import {
  formatGateEvalOutputsZh,
  formatIntakeOutputsZh,
  formatResearchOutputsZh,
  formatResearchTeamAuditOutputsZh,
  formatStateUpdateOutputsZh,
  formatVerifyOutputsZh,
} from './decision-log-user-facing.zh.util';

describe('decision-log-user-facing.zh.util', () => {
  it('formatIntakeOutputsZh：缺口为零与有待补齐', () => {
    expect(formatIntakeOutputsZh('PLAN_TRIP', 0)).toContain('无需额外追问');
    expect(formatIntakeOutputsZh('PLAN_TRIP', 2)).toContain('2 项关键信息');
  });

  it('formatStateUpdateOutputsZh：口头描述目的地变更', () => {
    const s = formatStateUpdateOutputsZh({
      hasUserIntent: true,
      hasConstraints: false,
      hasEnvironmentState: false,
      version: 3,
      destinationBefore: null,
      destinationAfter: '冰岛',
    });
    expect(s).toContain('冰岛');
    expect(s).toContain('版本 3');
  });

  it('formatResearchOutputsZh：列出数据类别', () => {
    const s = formatResearchOutputsZh(['transport_evidence', 'poi_evidence', 'unknown_key']);
    expect(s).toMatch(/3 类/);
    expect(s).toContain('交通');
  });

  it('formatResearchTeamAuditOutputsZh：执行形态与成员规划', () => {
    const s = formatResearchTeamAuditOutputsZh([
      {
        action: 'plan_members',
        detail: {
          research_execution_kind: 'SCOPED_PARTIAL',
          members_planned: ['HotelResearchMember'],
        },
      },
      { action: 'execute', duration_ms: 42 },
    ]);
    expect(s).toContain('SCOPED_PARTIAL');
    expect(s).toContain('HotelResearchMember');
    expect(s).toContain('42');
  });

  it('formatGateEvalOutputsZh：放行措辞', () => {
    expect(formatGateEvalOutputsZh('ALLOW', 0)).toContain('放行');
  });

  it('formatVerifyOutputsZh：保留「个问题」子串供下游启发式使用', () => {
    expect(formatVerifyOutputsZh({ issueCount: 0, fatal: 0, conflict: 0, advisory: 0 })).not.toContain('个问题');
    expect(
      formatVerifyOutputsZh({ issueCount: 2, fatal: 1, conflict: 1, advisory: 0 }),
    ).toContain('个问题');
  });
});
