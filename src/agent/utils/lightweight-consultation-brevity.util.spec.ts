import {
  buildCarRentalConsultationBodyPromptLines,
  buildLightweightConsultationRolePromptLines,
  buildLightweightConsultationUiBlockPromptLines,
  buildStructuredConsultationDensityPromptLines,
  formatDenseConsultationAnswerWithLineBreaks,
  isExplicitDetailConsultationQuery,
  resolveLightweightConsultationVerbosity,
} from './lightweight-consultation-brevity.util';

describe('lightweight-consultation-brevity.util', () => {
  it('detects explicit detail asks', () => {
    expect(isExplicitDetailConsultationQuery('请详细说说租车怎么选')).toBe(true);
    expect(isExplicitDetailConsultationQuery('in detail, rental options')).toBe(true);
    expect(isExplicitDetailConsultationQuery('Day2住哪')).toBe(false);
  });

  it('resolves compact by default and structured for overview/lodging/detail', () => {
    expect(
      resolveLightweightConsultationVerbosity({
        triviaFact: false,
        tripStatusOverview: false,
        tripLodgingDiningPlan: false,
        explicitDetail: false,
      }),
    ).toBe('compact');
    expect(
      resolveLightweightConsultationVerbosity({
        triviaFact: false,
        tripStatusOverview: true,
        tripLodgingDiningPlan: false,
        explicitDetail: false,
      }),
    ).toBe('structured');
    expect(
      resolveLightweightConsultationVerbosity({
        triviaFact: true,
        tripStatusOverview: true,
        tripLodgingDiningPlan: false,
        explicitDetail: true,
      }),
    ).toBe('trivia');
  });

  it('compact role lines emphasize short answers', () => {
    const lines = buildLightweightConsultationRolePromptLines('compact');
    expect(lines.join('\n')).toContain('快答');
    expect(lines.join('\n')).toContain('2～5 句');
    expect(lines.join('\n')).toContain('排版');
  });

  it('car rental body prompt requires line breaks and optional card分工', () => {
    const base = buildCarRentalConsultationBodyPromptLines(false).join('\n');
    expect(base).toContain('租车正文排版');
    expect(base).toContain('结论：');
    expect(base).not.toContain('car_rental_cards');
    const withCards = buildCarRentalConsultationBodyPromptLines(true).join('\n');
    expect(withCards).toContain('car_rental_cards');
  });

  it('formats dense single-paragraph consultation into line breaks', () => {
    const dense =
      '结论：建议租四驱SUV。取还车放在雷克雅未克市中心即可。本地公司如Blue通常更划算。提车时务必确认碎石险。';
    const out = formatDenseConsultationAnswerWithLineBreaks(dense);
    expect(out).toContain('结论：\n');
    expect(out.split('\n').length).toBeGreaterThanOrEqual(3);
    expect(out).not.toMatch(/建议租四驱SUV。取还车/);
  });

  it('formats general dense replies (not only car rental)', () => {
    const dense =
      '建议：今天南岸路况整体OPEN。另外风力偏大，海边停车要注意。最后记得预留午餐时间。';
    const out = formatDenseConsultationAnswerWithLineBreaks(dense);
    expect(out).toContain('建议：\n');
    expect(out.split('\n').length).toBeGreaterThanOrEqual(3);
  });

  it('keeps short single-sentence answers unchanged', () => {
    expect(formatDenseConsultationAnswerWithLineBreaks('雷克雅未克现在是下午3点。')).toBe(
      '雷克雅未克现在是下午3点。',
    );
  });

  it('leaves already structured answers alone', () => {
    const structured = '结论：四驱SUV。\n\n- 取还车：雷克雅未克\n- 车型：SUV';
    expect(formatDenseConsultationAnswerWithLineBreaks(structured)).toBe(structured);
  });

  it('compact UI block allows omitting full four-card dashboard', () => {
    const lines = buildLightweightConsultationUiBlockPromptLines({
      verbosity: 'compact',
      markers: {
        uiStart: '<<<CONSULTATION_UI_JSON>>>',
        uiEnd: '<<<END_CONSULTATION_UI_JSON>>>',
        opsStart: '<<<SUGGESTED_OPS_JSON>>>',
        opsEnd: '<<<END_SUGGESTED_OPS_JSON>>>',
      },
    });
    const joined = lines.join('\n');
    expect(joined).toContain('可选');
    expect(joined).toContain('至多 2 张');
    expect(joined).not.toContain('建议 4 张');
  });

  it('structured density lines differ by kind', () => {
    expect(buildStructuredConsultationDensityPromptLines('overview').join('')).toContain('1～2 句');
    expect(buildStructuredConsultationDensityPromptLines('lodging_dining').join('')).toContain(
      '勿再抄房名',
    );
  });
});
