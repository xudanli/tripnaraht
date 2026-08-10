import {
  buildXhsSearchKeywordFromMessage,
  isXhsCommunityEvidenceConsultQuery,
  mapXhsExperienceBundleToNoteCards,
  projectXhsNoteCardsFromUnknown,
  XHS_NOTE_CARDS_SCHEMA,
} from './build-xhs-note-chat-cards.util';
import type { XhsExperienceBundle } from '../../mcp/xiaohongshu-evidence.mapper';

describe('build-xhs-note-chat-cards.util', () => {
  it('detects community evidence consult queries', () => {
    expect(
      isXhsCommunityEvidenceConsultQuery(
        '这趟行程需要注意什么值不值得，然后看看小红书怎么做',
      ),
    ).toBe(true);
    expect(isXhsCommunityEvidenceConsultQuery('G318 值不值得')).toBe(true);
    expect(isXhsCommunityEvidenceConsultQuery('推荐酒店')).toBe(false);
  });

  it('builds search keyword without meta noise', () => {
    const k = buildXhsSearchKeywordFromMessage(
      '这趟行程需要注意什么值不值得，然后看看小红书怎么做',
      'G318',
    );
    expect(k).toContain('值不值得');
    expect(k).toContain('G318');
    expect(k).not.toMatch(/小红书怎么/);
  });

  const bundle: XhsExperienceBundle = {
    query: '冰岛 冰川徒步',
    sampleSize: 2,
    stance: { worth: 1, skip: 1, conditional: 0, unclear: 0 },
    themes: [],
    risksMentioned: [],
    evidenceRefs: ['xhs:a', 'xhs:b'],
    disclaimerZh: '基于小红书社区体验抽样，非官方事实；与天气/道路/库存冲突时以官方传感器为准。',
    source: 'xiaohongshu',
    facts: [
      {
        factId: 'xhs:a',
        sourceType: 'COMMUNITY',
        evidenceKind: 'community_note',
        strength: 'MODERATE',
        freshness: 'ASSUMED',
        title: '冰川徒步强烈推荐',
        excerpt: '看天气出片',
        sourceUrl: 'https://www.xiaohongshu.com/explore/a',
        mediaUrl: 'https://img.example/a.jpg',
        engagement: { liked: 50 },
        disclaimerZh: '小红书社区体验，非官方事实',
      },
      {
        factId: 'xhs:b',
        sourceType: 'COMMUNITY',
        evidenceKind: 'community_note',
        strength: 'WEAK',
        freshness: 'ASSUMED',
        title: '无链接笔记',
        excerpt: '不应出卡',
        disclaimerZh: '小红书社区体验，非官方事实',
      },
    ],
  };

  it('maps only facts with https url', () => {
    const cards = mapXhsExperienceBundleToNoteCards(bundle);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.url).toContain('xiaohongshu.com');
    expect(cards[0]!.cta_zh).toBe('查看笔记');
    expect(cards[0]!.sourceType).toBe('COMMUNITY');
    expect(cards[0]!.actions[0]!.action).toBe('open_xhs_note_url');
    expect(cards[0]!.photoUrl).toContain('example');
  });

  it('projects from agentic envelope tree', () => {
    const out = projectXhsNoteCardsFromUnknown({
      steps: [
        {
          tool_results: [
            {
              envelope: {
                success: true,
                data: { experience_bundle: bundle, disclaimer_zh: bundle.disclaimerZh },
              },
            },
          ],
        },
      ],
    });
    expect(out.xhs_note_cards).toHaveLength(1);
    expect(out.xhs_search_meta?.disclaimer_zh).toContain('社区体验');
    expect(XHS_NOTE_CARDS_SCHEMA).toContain('xhs_note');
  });
});
