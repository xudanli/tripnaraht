import { mergeCommunityExperienceIntoNarration } from './merge-community-experience-narration.util';
import { XHS_COMMUNITY_EVIDENCE_DISCLAIMER_ZH } from '../../../mcp/format-xhs-experience-narrator.util';

describe('mergeCommunityExperienceIntoNarration', () => {
  it('prepends community tip from research_data', () => {
    const narration = mergeCommunityExperienceIntoNarration(
      { tips: ['已有 tip'] },
      {
        research_data: {
          communityExperienceEvidence: {
            source: 'xiaohongshu',
            disclaimerZh: XHS_COMMUNITY_EVIDENCE_DISCLAIMER_ZH,
            bundles: [
              {
                query: '冰川徒步',
                sampleSize: 5,
                stance: { worth: 3, skip: 1, conditional: 1, unclear: 0 },
                themes: [],
                risksMentioned: [],
                disclaimerZh: XHS_COMMUNITY_EVIDENCE_DISCLAIMER_ZH,
              },
            ],
          },
        },
      } as any,
    );
    expect(narration.tips?.[0]).toContain('社区体验');
    expect(narration.tips?.[0]).toContain('非官方事实');
    expect(narration.research_ui_hints?.some((h) => h.scope === 'community')).toBe(
      true,
    );
  });

  it('no-ops without community evidence', () => {
    const input = { tips: ['x'] };
    const out = mergeCommunityExperienceIntoNarration(input, {
      research_data: {},
    } as any);
    expect(out).toEqual(input);
  });
});
