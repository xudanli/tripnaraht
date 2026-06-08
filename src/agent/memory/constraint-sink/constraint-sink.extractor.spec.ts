import { extractConstraintDeltasFromMessage } from './constraint-sink.extractor';

describe('extractConstraintDeltasFromMessage', () => {
  it('detects coastal avoid + inland pivot (TC-SINK-01 style)', () => {
    const r = extractConstraintDeltasFromMessage('不去南岸了，改去内陆高地吧');
    expect(r).not.toBeNull();
    expect(r!.applied_keys).toEqual(expect.arrayContaining(['negative.avoid_regions', 'destination_pivot']));
    expect(r!.delta.negative?.avoid_regions).toContain('south_coast');
    expect(r!.delta.destination_pivot?.to).toBe('highlands');
    expect(r!.confidence).toBeGreaterThanOrEqual(0.72);
  });

  it('detects relaxed pace', () => {
    const r = extractConstraintDeltasFromMessage('希望慢节奏，不要太赶');
    expect(r?.delta.pace).toBe('relaxed');
    expect(r?.applied_keys).toContain('pace');
  });

  it('returns null for unrelated message', () => {
    expect(extractConstraintDeltasFromMessage('今天天气怎么样？')).toBeNull();
  });
});
