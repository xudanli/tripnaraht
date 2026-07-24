import {
  buildHallucinationAuditSampleRowsZh,
  formatDecisionLogInputsDisplayZh,
  formatFullTripReplanIntakeInputsZh,
  formatGateEvalOutputsZh,
  formatHallucinationOutputsZh,
  formatPlanGenOutputsZh,
  formatIntakeInputsPreviewZh,
  formatIntakeOutputsZh,
  formatItineraryAdjustIntakeInputsZh,
  formatResearchOutputsZh,
  formatResearchTeamAuditOutputsZh,
  formatStateUpdateInputsZh,
  formatStateUpdateOutputsZh,
  formatVerifyOutputsZh,
} from './decision-log-user-facing.zh.util';

describe('decision-log-user-facing.zh.util', () => {
  it('formatIntakeInputsPreviewZh：用户请求前缀', () => {
    expect(formatIntakeInputsPreviewZh('推荐冰岛景点')).toBe('用户请求：推荐冰岛景点');
    expect(formatIntakeInputsPreviewZh('')).toBe('（未收到文字描述）');
  });

  it('formatItineraryAdjustIntakeInputsZh：含原话与识别结果', () => {
    const s = formatItineraryAdjustIntakeInputsZh({
      userMessage: '根据我的行程，推荐一些适合加入的景点',
      subIntent: 'poi_slot_fill',
      targetDateIso: '2026-11-01',
      targetDayNumber: 1,
      ctx: { destination: '冰岛', dateStart: '2026-11-01', dateEnd: '2026-11-06', dayCount: 6 },
    });
    expect(s).toContain('用户请求：');
    expect(s).toContain('追加推荐景点');
    expect(s).toContain('冰岛');
  });

  it('formatStateUpdateInputsZh：含目的地与用户话', () => {
    const s = formatStateUpdateInputsZh({
      userMessage: '推荐适合加入的景点',
      destination: '冰岛',
    });
    expect(s).toContain('冰岛');
    expect(s).toContain('推荐适合加入的景点');
  });

  it('formatPlanGenOutputsZh appends day poi digest', () => {
    const s = formatPlanGenOutputsZh(6, undefined, { destination: '冰岛' }, [
      { dayNumber: 1, dateIso: '2026-11-01', poiNames: ['冰河湖'] },
      { dayNumber: 2, dateIso: '2026-11-02', poiNames: ['钻石沙滩'] },
    ]);
    expect(s).toContain('6 天日程骨架');
    expect(s).toContain('第1天（11/1）冰河湖');
    expect(s).toContain('第2天（11/2）钻石沙滩');
  });

  it('formatDecisionLogInputsDisplayZh：剥离 Kernel/DSO 并映射旧文案', () => {
    expect(
      formatDecisionLogInputsDisplayZh({
        inputs_summary: '对照出行约束与目的地规则做门禁检查（Kernel）',
      }),
    ).toBe('对照出行约束与目的地规则做门禁检查');
    expect(
      formatDecisionLogInputsDisplayZh({
        inputs_summary: '识别绑定 Trip 上的单日行程改排意图',
      }),
    ).toContain('单日改排');
  });
  it('formatIntakeOutputsZh：缺口为零与有待补齐', () => {
    expect(formatIntakeOutputsZh('PLAN_TRIP', 0)).toContain('无需额外追问');
    expect(formatIntakeOutputsZh('PLAN_TRIP', 2)).toContain('2 项关键信息');
  });

  it('formatStateUpdateOutputsZh：口头描述目的地变更', () => {
    const s = formatStateUpdateOutputsZh({
      hasUserIntent: true,
      hasConstraints: true,
      hasEnvironmentState: false,
      version: 3,
      destinationBefore: null,
      destinationAfter: '冰岛',
      ctx: {
        destination: '冰岛',
        dateStart: '2026-11-01',
        dateEnd: '2026-11-06',
        dayCount: 6,
      },
    });
    expect(s).toContain('冰岛');
    expect(s).toContain('11/1');
    expect(s).toContain('版本 3');
  });

  it('formatResearchOutputsZh：列出数据类别与行程范围', () => {
    const s = formatResearchOutputsZh(['transport_evidence', 'poi_evidence', 'unknown_key'], {
      destination: '冰岛',
      dateStart: '2026-11-01',
      dateEnd: '2026-11-06',
    });
    expect(s).toMatch(/3 类/);
    expect(s).toContain('冰岛');
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

  it('formatGateEvalOutputsZh：放行措辞与三人格', () => {
    const s = formatGateEvalOutputsZh('ALLOW', 0, { abu: 'ALLOW', drdre: 'ALLOW' });
    expect(s).toContain('放行');
    expect(s).toContain('三人格');
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
