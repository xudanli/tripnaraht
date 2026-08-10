import {
  appendXhsCommunityDisclaimerToAnswer,
  extractXhsDisclaimerFromUnknown,
  formatXhsExperienceNarratorBlock,
  formatXhsExperienceTipZh,
  XHS_COMMUNITY_EVIDENCE_DISCLAIMER_ZH,
} from './format-xhs-experience-narrator.util';

const sample = {
  query: '冰岛 冰川徒步',
  sampleSize: 8,
  stance: { worth: 5, skip: 1, conditional: 1, unclear: 1 },
  themes: [{ label: '值得', count: 4, quoteIds: [] }],
  risksMentioned: ['天气变幻'],
  disclaimerZh: XHS_COMMUNITY_EVIDENCE_DISCLAIMER_ZH,
};

describe('format-xhs-experience-narrator.util', () => {
  it('formats narrator block with disclaimer', () => {
    const block = formatXhsExperienceNarratorBlock(sample);
    expect(block).toContain('社区体验·小红书');
    expect(block).toContain('非官方事实');
    expect(block).toContain('值得/推荐 5');
  });

  it('formats tip line', () => {
    const tip = formatXhsExperienceTipZh(sample);
    expect(tip.startsWith('[社区体验]')).toBe(true);
    expect(tip).toContain('抽样 8');
  });

  it('appends disclaimer once', () => {
    const once = appendXhsCommunityDisclaimerToAnswer('正文', sample.disclaimerZh);
    expect(once).toContain('【说明】');
    const twice = appendXhsCommunityDisclaimerToAnswer(once, sample.disclaimerZh);
    expect(twice).toBe(once);
  });

  it('extracts disclaimer from nested tool result', () => {
    const d = extractXhsDisclaimerFromUnknown({
      steps: [
        {
          tool_results: [
            {
              envelope: {
                experience_bundle: { disclaimerZh: XHS_COMMUNITY_EVIDENCE_DISCLAIMER_ZH },
              },
            },
          ],
        },
      ],
    });
    expect(d).toContain('社区体验');
  });
});
