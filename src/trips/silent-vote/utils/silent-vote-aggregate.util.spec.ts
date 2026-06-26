import {
  buildSilentVoteAggregate,
  detectHighIntensityMinority,
} from './silent-vote-aggregate.util';

const options = [
  { id: 'opt-a', label: '方案 A' },
  { id: 'opt-b', label: '方案 B' },
];

describe('buildSilentVoteAggregate', () => {
  it('applies k-anonymity while vote is open with few submissions', () => {
    const agg = buildSilentVoteAggregate({
      voteId: 'v1',
      status: 'open',
      options,
      ballots: [
        { optionId: 'opt-a', intensity: 5 },
        { optionId: 'opt-b', intensity: 2 },
      ],
      eligibleCount: 5,
    });
    expect(agg.kAnonymityApplied).toBe(true);
    expect(agg.optionDistribution).toBeNull();
    expect(agg.submittedCount).toBe(2);
  });

  it('returns heatmap and minority hint when closed', () => {
    const agg = buildSilentVoteAggregate({
      voteId: 'v1',
      status: 'closed',
      options,
      ballots: [
        { optionId: 'opt-a', intensity: 3 },
        { optionId: 'opt-a', intensity: 4 },
        { optionId: 'opt-a', intensity: 3 },
        { optionId: 'opt-b', intensity: 5 },
      ],
      eligibleCount: 4,
    });
    expect(agg.optionDistribution).toEqual([
      { optionId: 'opt-a', label: '方案 A', count: 3, share: 0.75 },
      { optionId: 'opt-b', label: '方案 B', count: 1, share: 0.25 },
    ]);
    expect(agg.discussionHints).toHaveLength(1);
    expect(agg.discussionHints[0].type).toBe('HIGH_INTENSITY_MINORITY');
    expect(agg.discussionHints[0].optionId).toBe('opt-b');
  });
});

describe('detectHighIntensityMinority', () => {
  it('flags minority option with intensity 4+', () => {
    const distribution = [
      { optionId: 'a', label: 'A', count: 3, share: 0.75 },
      { optionId: 'b', label: 'B', count: 1, share: 0.25 },
    ];
    const heatmap = [
      {
        optionId: 'a',
        label: 'A',
        buckets: { '1': 0, '2': 0, '3': 3, '4': 0, '5': 0 },
        meanIntensity: 3,
        weightedScore: 9,
      },
      {
        optionId: 'b',
        label: 'B',
        buckets: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 1 },
        meanIntensity: 5,
        weightedScore: 5,
      },
    ];
    const hints = detectHighIntensityMinority(distribution, heatmap);
    expect(hints).toHaveLength(1);
    expect(hints[0].severity).toBe('medium');
  });
});
