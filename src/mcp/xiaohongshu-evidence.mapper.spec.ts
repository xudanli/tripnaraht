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
