import {
  humanizeFeasibilityMessageForUserZh,
  humanizeVerifyConflictCode,
  humanizeVerifyIssueHeadlineZh,
  stripLeadingAuditBracketTags,
  stripLeadingL3ProofBlocks,
  simplifyDecisionLogLineForUserZh,
  sanitizeGateResultForClientDisplay,
  alignGuardianResultsWithGateViolations,
  sanitizeVerificationIssueForClientDisplay,
  sanitizeDecisionLogForClientDisplay,
  sanitizeClarificationQuestionsForClientDisplay,
} from './feasibility-message-surface.zh.util';

describe('feasibility-message-surface.zh.util', () => {
  it('stripLeadingL3ProofBlocks removes L3 prefix and keeps user text', () => {
    const raw =
      '[L3-PROOF|terrain.f_road_compatibility|OTHER:vehicle_terrain_arbitrator|cmp:LEQ|actual:|limit:|unit:|slack:|evidence:MODEL:x] 在冰岛 F 路需四驱，当前经济车型不适用。';
    expect(stripLeadingL3ProofBlocks(raw)).toBe('在冰岛 F 路需四驱，当前经济车型不适用。');
  });

  it('humanizeVerifyConflictCode maps known codes', () => {
    expect(humanizeVerifyConflictCode('ROUTE_INFEASIBLE')).toContain('路线');
    expect(humanizeVerifyConflictCode('UNKNOWN_CODE_X')).toBe('UNKNOWN_CODE_X');
  });

  it('humanizeFeasibilityMessageForUserZh expands VERIFY ROUTE_INFEASIBLE', () => {
    const s = humanizeFeasibilityMessageForUserZh('[VERIFY] ROUTE_INFEASIBLE: Krossá 涉水段与 2WD 不匹配');
    expect(s).toContain('路线与当前车型');
    expect(s).toContain('Krossá');
    expect(s).not.toMatch(/^\[L3-PROOF\|/);
  });

  it('humanizeFeasibilityMessageForUserZh handles merge-verify detail + L3 + audit tag', () => {
    const merged =
      '[VERIFY] ROUTE_INFEASIBLE [entity:OTHER:vehicle_terrain_arbitrator]: ' +
      '[L3-PROOF|terrain.f_road_compatibility|OTHER:vehicle_terrain_arbitrator|cmp:LEQ|actual:|limit:|unit:|slack:|evidence:MODEL:user_query,intent_virtual_car_rental,itinerary_text] ' +
      '【车型-路况仲裁·意图合规】行程含 F-road/高地特征，用户话术或约束表明使用 2WD/经济型车辆：在未取得合规四驱订单前，该组合在冰岛属于违法且极高风险（保险通常无效）。';
    const s = humanizeFeasibilityMessageForUserZh(merged);
    expect(s).not.toContain('[L3-PROOF');
    expect(s).not.toContain('[VERIFY]');
    expect(s).not.toContain('ROUTE_INFEASIBLE');
    expect(s).not.toContain('【车型-路况仲裁');
    expect(s).toContain('路线与当前车型');
    expect(s).toContain('违法');
  });

  it('humanizeVerifyIssueHeadlineZh avoids raw English codes in titles', () => {
    expect(humanizeVerifyIssueHeadlineZh('ROUTE_INFEASIBLE')).toBe('可执行性：路线与当前车型或路况条件不匹配（可能含高地 / F 路等限制路段）');
  });

  it('alignGuardianResultsWithGateViolations projects REJECT when VERIFY HARD but llm_debate all ALLOW', () => {
    const gate = alignGuardianResultsWithGateViolations({
      gate_result: 'ALLOW',
      violations: [
        {
          type: 'SAFETY',
          severity: 'HARD',
          detail: '[VERIFY] ROUTE_INFEASIBLE: 2WD on F-road',
        },
      ],
      required_adjustments: [],
      confidence: 0.9,
      evidence_refs: [],
      guardian_results: {
        source: 'llm_debate',
        abu: { verdict: 'ALLOW', evidence: [] },
        drdre: { verdict: 'ALLOW', evidence: [] },
        neptune: { verdict: 'ALLOW', evidence: [] },
      },
    });
    expect(gate.guardian_results?.abu?.verdict).toBe('REJECT');
    expect(gate.guardian_results?.source).toBe('llm_debate');
  });

  it('sanitizeGateResultForClientDisplay strips L3 and VERIFY codes from violations', () => {
    const gate = sanitizeGateResultForClientDisplay({
      gate_result: 'ALLOW',
      violations: [
        {
          type: 'SAFETY',
          severity: 'HARD',
          detail:
            '[VERIFY] ROUTE_INFEASIBLE [entity:OTHER:vehicle_terrain_arbitrator]: [L3-PROOF|terrain.f_road_compatibility|OTHER:vehicle_terrain_arbitrator|cmp:LEQ|actual:|limit:|unit:|slack:|evidence:MODEL:user_query,intent_virtual_car_rental,itinerary_text] 【车型-路况仲裁·意图合规】行程含 F-road/高地特征，用户话术表明使用 2WD/经济型车辆。',
          verify_synthetic: true,
        },
      ],
      required_adjustments: [],
      confidence: 0.9,
      evidence_refs: [],
    });
    expect(gate.violations[0].detail).not.toContain('[L3-PROOF');
    expect(gate.violations[0].detail).not.toContain('ROUTE_INFEASIBLE');
    expect(gate.violations[0].detail).toContain('路线与当前车型');
    expect(gate.violations[0].display_headline_zh).toContain('可执行性');
  });

  it('sanitizeGateResultForClientDisplay can strip verify_synthetic when gate ALLOW', () => {
    const gate = sanitizeGateResultForClientDisplay(
      {
        gate_result: 'ALLOW',
        violations: [
          {
            type: 'SAFETY',
            severity: 'HARD',
            detail:
              '[VERIFY] UNKNOWN: VERIFY requires boundResearchSnapshotId on visible state (RESEARCH freeze).',
            verify_synthetic: true,
          },
        ],
        required_adjustments: [],
        confidence: 0.8,
        evidence_refs: [],
        guardian_results: {
          source: 'violation_projection_v1',
          abu: {
            verdict: 'REJECT',
            evidence: ['[VERIFY] UNKNOWN: VERIFY requires boundResearchSnapshotId on visible state (RESEARCH freeze).'],
          },
        },
      },
      { stripVerifySyntheticWhenAllow: true },
    );
    expect(gate.violations).toEqual([]);
    expect(gate.guardian_results?.abu?.verdict).toBe('ALLOW');
  });

  it('stripVerifySyntheticForItineraryAdjust removes POI_CLOSED even when gate is not ALLOW', () => {
    const gate = sanitizeGateResultForClientDisplay(
      {
        gate_result: 'ADJUST_REQUIRED',
        violations: [
          {
            type: 'DATA_MISSING',
            severity: 'SOFT',
            detail:
              '[VERIFY] POI_CLOSED [entity:POI:a]: POI "斯卡夫塔山国家公园" 在 2026-06-02 11:00 不在开放时间范围内',
            verify_synthetic: true,
          },
          {
            type: 'DATA_MISSING',
            severity: 'SOFT',
            detail:
              '[VERIFY] POI_CLOSED [entity:POI:b]: POI "斯科加瀑布" 在 2026-06-02 13:00 不在开放时间范围内',
            verify_synthetic: true,
          },
        ],
        required_adjustments: [],
        confidence: 0.8,
        evidence_refs: [],
      },
      { stripVerifySyntheticForItineraryAdjust: true },
    );
    expect(gate.violations).toEqual([]);
  });

  it('stripLeadingAuditBracketTags removes internal 【…】 headers', () => {
    expect(stripLeadingAuditBracketTags('【车型-路况仲裁】正文')).toBe('正文');
  });

  it('humanizeVerifyIssueHeadlineZh uses 提示 for ADVISORY class', () => {
    expect(humanizeVerifyIssueHeadlineZh('POI_CLOSED', 'ADVISORY')).toContain('提示');
    expect(humanizeVerifyIssueHeadlineZh('POI_CLOSED', 'ADVISORY')).toContain('开放时间');
  });

  it('sanitizeVerificationIssueForClientDisplay strips L3 from POI_CLOSED ADVISORY', () => {
    const raw =
      '[L3-PROOF|entity.opening_hours_overlap|POI:req-1_day1_item1|cmp:LEQ|actual:|limit:|unit:|slack:|evidence:OPENING_HOURS] ' +
      'POI "Krossá River Crossing" 缺少开放时间数据';
    const out = sanitizeVerificationIssueForClientDisplay({
      code: 'POI_CLOSED',
      class: 'ADVISORY',
      message: raw,
    });
    expect(out.message).not.toContain('[L3-PROOF');
    expect(out.message).toContain('Krossá River Crossing');
    expect(out.code_label_zh).toContain('开放时间');
    expect(out.class_label_zh).toBe('提示');
    expect(out.headline_zh).toContain('提示');
  });

  it('sanitizeDecisionLogForClientDisplay sanitizes VERIFY metadata.issues', () => {
    const log = sanitizeDecisionLogForClientDisplay([
      {
        request_id: 'r1',
        step: 'VERIFY',
        actor: 'Orchestrator',
        inputs_summary: 'x',
        outputs_summary: 'y',
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: {
          issues: [
            {
              code: 'POI_CLOSED',
              class: 'ADVISORY',
              message:
                '[L3-PROOF|entity.opening_hours_overlap|POI:x|cmp:LEQ|actual:|limit:|unit:|slack:|evidence:OPENING_HOURS] POI "Landmannalaugar" 缺少开放时间数据',
            },
          ],
        },
      },
    ]);
    const issue = (log[0].metadata?.issues as Array<Record<string, unknown>>)?.[0];
    expect(issue?.message).not.toContain('[L3-PROOF');
    expect(issue?.display_message_zh).toContain('Landmannalaugar');
  });

  it('simplifyDecisionLogLineForUserZh strips L3 and abbreviations', () => {
    const line = simplifyDecisionLogLineForUserZh({
      outputs_summary:
        '[L3-PROOF|time_space.min_transfer_buffer|X|cmp:LEQ|actual:1|limit:5|unit:min|slack:-4|evidence:M:a] VERIFY: 转乘过紧',
    });
    expect(line).toContain('验证');
    expect(line).not.toContain('L3-PROOF');
  });

  it('sanitizeClarificationQuestionsForClientDisplay strips L3 and intent compile prefix', () => {
    const [q] = sanitizeClarificationQuestionsForClientDisplay([
      {
        id: 'question-1',
        question:
          '【意图编译失败】[L3-PROOF|time_space.max_driving_hours|DAY:baseline|cmp:LEQ|actual:19.03|limit:10|unit:h|slack:-9.03|evidence:LOWER_BOUND] 物理下界校验不通过：环岛距离约 1332km，在 1 天内日均需驾驶约 19 小时，已超过安全上限 10 小时。建议增加天数或缩小范围。',
        type: 'single_choice',
        required: true,
        options: ['增加天数'],
      },
    ]);
    expect(q.question).not.toContain('L3-PROOF');
    expect(q.question).not.toContain('【意图编译失败】');
    expect(q.question).toContain('1332');
  });
});
