import {
  buildRuleAdvisorCopy,
  clampAdvisorCopy,
  clampChars,
  PageInsightNarrativeService,
} from './page-insight-narrative.service';
import type { DeterministicInsightSelection } from './decision-space-insight.selector';

function baseSelection(
  overrides: Partial<DeterministicInsightSelection> = {},
): DeterministicInsightSelection {
  return {
    mode: 'ATTENTION',
    priority: 'P1',
    insightType: 'DECISION_REQUIRED',
    title: '选择哪种冰川体验？',
    observationSummary: '加入冰川徒步会影响时间与体力。',
    explanationSummary: '加入冰川徒步会影响时间与体力。',
    impacts: [
      {
        dimension: 'TIME',
        severity: 'MEDIUM',
        summary: '加入冰川徒步会影响时间与体力。',
      },
    ],
    recommendation: {
      summary: '建议选择「短线」',
      rationale: '耗时更短',
      recommendedOptionId: 'glacier_short',
    },
    actions: [],
    confidence: 0.8,
    evidenceRefs: [],
    factRefs: ['decision-problem:dc_glacier_t'],
    focusedProblemId: 'dc_glacier_t',
    modeReason: 'MATERIAL_OPTION_DIVERGENCE',
    ...overrides,
  };
}

describe('PageInsightNarrativeService (advisor copy)', () => {
  it('clamps title/body/advice to product limits', () => {
    const c = clampAdvisorCopy({
      title: '一二三四五六七八九十一二三',
      body: '说明'.repeat(30),
      advice: '建议'.repeat(20),
    });
    expect([...c.title].length).toBeLessThanOrEqual(12);
    expect([...c.body].length).toBeLessThanOrEqual(40);
    expect([...c.advice].length).toBeLessThanOrEqual(24);
  });

  it('rule copy does not echo page summary', () => {
    const page = '加入冰川徒步会影响时间与体力。';
    const copy = buildRuleAdvisorCopy(baseSelection(), page);
    expect(copy.body).not.toBe(page);
    expect(copy.body.includes(page)).toBe(false);
    expect(copy.title).toBe('方案取舍不同');
    expect(copy.advice).toContain('短线');
  });

  it('SILENT selection returns forceSilent', async () => {
    const svc = new PageInsightNarrativeService();
    const result = await svc.polish(
      baseSelection({ mode: 'SILENT', modeReason: 'DETAIL_SURFACE_SUPPRESSES' }),
      { pageVisibleSummary: '加入冰川徒步会影响时间与体力。' },
    );
    expect(result.forceSilent).toBe(true);
    expect(result.llmUsed).toBe(false);
  });

  it('without LLM uses rule advisor copy', async () => {
    const svc = new PageInsightNarrativeService();
    const page = '加入冰川徒步会影响时间与体力。';
    const result = await svc.polish(baseSelection(), {
      pageName: '决策空间',
      currentTask: '选择哪种冰川体验？',
      pageVisibleSummary: page,
    });
    expect(result.llmUsed).toBe(false);
    expect(result.advisorCopy.body).not.toBe(page);
    expect([...result.advisorCopy.title].length).toBeLessThanOrEqual(12);
  });

  it('clampChars counts CJK correctly', () => {
    expect(clampChars('abcdefghijklm', 5)).toBe('abcde');
    expect(clampChars('一二三四五六', 4)).toBe('一二三四');
  });
});
