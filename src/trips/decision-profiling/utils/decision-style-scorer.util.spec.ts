import { buildTravelStyleCard, scoreDecisionStyles } from './decision-style-scorer.util';

describe('decision-style-scorer.util', () => {
  it('classifies pragmatic planner from glacier/aurora scenario', () => {
    const answers = [
      { questionId: 'ts_q1', optionId: 'a' },
      { questionId: 'ts_q2', optionId: 'a' },
      { questionId: 'ts_q3', optionId: 'a' },
      { questionId: 'ts_q4', optionId: 'c' },
      { questionId: 'ts_q5', optionId: 'b' },
    ];
    const card = buildTravelStyleCard('u1', answers);
    expect(card.styleType).toBe('PRAGMATIC_PLANNER');
    expect(card.styleLabel).toBe('务实规划者');
  });

  it('classifies harmony coordinator when consensus options dominate', () => {
    const answers = [
      { questionId: 'ts_q1', optionId: 'd' },
      { questionId: 'ts_q2', optionId: 'd' },
      { questionId: 'ts_q3', optionId: 'd' },
      { questionId: 'ts_q4', optionId: 'd' },
      { questionId: 'ts_q5', optionId: 'd' },
    ];
    const scores = scoreDecisionStyles(answers);
    expect(scores.HARMONY_COORDINATOR).toBeGreaterThan(scores.SPONTANEOUS_ADVENTURER);
  });
});
