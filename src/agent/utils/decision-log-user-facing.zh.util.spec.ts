import {
  buildHallucinationAuditSampleRowsZh,
  formatGateEvalOutputsZh,
  formatHallucinationOutputsZh,
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

  it('formatHallucinationOutputsZh：零风险时措辞与可选明细', () => {
    const base = formatHallucinationOutputsZh(24, 24, 0, {
      durationMs: 12,
      sampleRows: buildHallucinationAuditSampleRowsZh({
        verifiedClaims: [{ text: '冰岛夏季白昼很长。', verified: true, confidence: 0.9 }],
        riskClaims: [],
        maxRows: 3,
      }),
    });
    expect(base).toContain('未发现需额外标注或移除的高风险陈述');
    expect(base).toContain('本步耗时约 12ms');
    expect(base).toContain('抽查摘录');
    expect(base).toContain('冰岛夏季白昼很长');
  });

  it('buildHallucinationAuditSampleRowsZh：优先风险样例再补充一致项', () => {
    const rows = buildHallucinationAuditSampleRowsZh({
      verifiedClaims: [
        { text: 'A', verified: true, confidence: 0.5 },
        { text: 'B', verified: true, confidence: 0.99 },
      ],
      riskClaims: [{ text: '可疑句', action: 'FLAG', confidence: 0.2 }],
      maxRows: 3,
    });
    expect(rows[0].outcome_zh).toContain('存疑');
    expect(rows[0].excerpt_zh).toContain('可疑');
    expect(rows.some((r) => r.excerpt_zh === 'B')).toBe(true);
  });
});
