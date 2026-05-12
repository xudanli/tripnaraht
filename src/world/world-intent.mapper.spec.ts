import { userPhraseToWorldCommand } from './world-intent.mapper';

describe('userPhraseToWorldCommand', () => {
  it('maps mountain-road avoidance to driving constraint', () => {
    const cmd = userPhraseToWorldCommand('我不想开很长的山路');
    expect(cmd).toEqual({
      type: 'ADD_DRIVING_CONSTRAINT',
      constraint: { maxMountainRoadRatio: 0.2 },
    });
  });

  it('returns undefined when no heuristic matches', () => {
    expect(userPhraseToWorldCommand('随便逛逛')).toBeUndefined();
  });
});
