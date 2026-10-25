import {
  mapXhsFeedRowToFact,
  mapXhsFeedsToExperienceBundle,
} from './xiaohongshu-evidence.mapper';

describe('xiaohongshu-evidence.mapper', () => {
  it('maps feed row to COMMUNITY fact', () => {
    const fact = mapXhsFeedRowToFact(
      {
        feed_id: 'note123',
        title: '冰岛冰川徒步太值得了',
        desc: '跟向导走，注意天气和体力',
        liked_count: 320,
        cover: 'https://img.example/c.jpg',
      },
      0,
    );
    expect(fact?.sourceType).toBe('COMMUNITY');
    expect(fact?.strength).toBe('MODERATE');
    expect(fact?.factId).toBe('xhs:note123');
    expect(fact?.mediaUrl).toContain('example');
  });

  it('maps nested noteCard / interactInfo / xsecToken (REST shape)', () => {
    const fact = mapXhsFeedRowToFact(
      {
        id: '68abc123',
        xsecToken: 'tok_abc',
        noteCard: {
          displayTitle: '西藏的冰川真的绝',
          user: { nickname: '旅人A' },
          interactInfo: { likedCount: 120, collectedCount: 30, commentCount: 8 },
          cover: { url: 'https://sns-img.example/cover.jpg' },
        },
      },
      0,
    );
    expect(fact?.factId).toBe('xhs:68abc123');
    expect(fact?.title).toContain('冰川');
    expect(fact?.strength).toBe('MODERATE');
    expect(fact?.authorRef).toBe('旅人A');
    expect(fact?.mediaUrl).toContain('sns-img');
    expect(fact?.sourceUrl).toContain('explore/68abc123');
    expect(fact?.sourceUrl).toContain('xsec_token=tok_abc');
    expect(fact?.engagement?.liked).toBe(120);
  });

  it('aggregates stance / themes / risks', () => {
    const bundle = mapXhsFeedsToExperienceBundle({
      query: '冰岛 冰川徒步',
      destinationHint: 'Iceland',
      raw: {
        feeds: [
          {
            feed_id: 'a',
            title: '冰川徒步强烈推荐',
            desc: '出片，但看天气',
            liked_count: 50,
          },
          {
            feed_id: 'b',
            title: '不值得，坑',
            desc: '路况差还关门',
            liked_count: 10,
          },
        ],
      },
    });
    expect(bundle.sampleSize).toBe(2);
    expect(bundle.stance.worth + bundle.stance.conditional).toBeGreaterThan(0);
    expect(bundle.stance.skip).toBe(1);
    expect(bundle.risksMentioned.length).toBeGreaterThan(0);
    expect(bundle.evidenceRefs).toEqual(['xhs:a', 'xhs:b']);
    expect(bundle.disclaimerZh).toContain('社区体验');
  });
});
