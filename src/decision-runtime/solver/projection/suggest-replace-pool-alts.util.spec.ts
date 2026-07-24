import {
  parseReplaceAlternateNodeId,
  replaceAlternateNodeId,
  suggestReplacePoolAlts,
} from './suggest-replace-pool-alts.util';

describe('suggest-replace-pool-alts', () => {
  it('returns Iceland fixture alts for known poiId', () => {
    const alts = suggestReplacePoolAlts({
      fromNodeId: 'a1',
      poiId: 'is.skaftafell',
      limit: 3,
    });
    expect(alts.length).toBe(2);
    expect(alts[0]!.source).toBe('fixture');
    expect(alts[0]!.poiId).toBe('is.skaftafell.visitor_center');
    expect(alts[0]!.nodeId).toBe('alt:a1');
    expect(alts[1]!.nodeId).toBe('alt:a1:1');
  });

  it('falls back to synthetic when fixture miss', () => {
    const alts = suggestReplacePoolAlts({
      fromNodeId: 'x',
      poiId: 'is.unknown_place',
    });
    expect(alts).toHaveLength(1);
    expect(alts[0]!.source).toBe('synthetic');
  });

  it('parses alt node ids with and without index', () => {
    expect(replaceAlternateNodeId('a1', 0)).toBe('alt:a1');
    expect(replaceAlternateNodeId('a1', 2)).toBe('alt:a1:2');
    expect(parseReplaceAlternateNodeId('alt:a1')).toEqual({
      fromNodeId: 'a1',
      index: 0,
    });
    expect(parseReplaceAlternateNodeId('alt:a1:2')).toEqual({
      fromNodeId: 'a1',
      index: 2,
    });
  });
});
