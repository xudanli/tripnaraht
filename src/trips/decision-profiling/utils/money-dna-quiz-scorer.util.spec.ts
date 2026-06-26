import { buildMoneyDnaCard, cosineSimilarity } from './money-dna-quiz-scorer.util';

describe('money-dna-quiz-scorer.util', () => {
  it('builds experience-heavy vector from budget answers', () => {
    const card = buildMoneyDnaCard('u1', [
      { questionId: 'md_q1', optionId: 'a' },
      { questionId: 'md_q2', optionId: 'c' },
      { questionId: 'md_q3', optionId: 'a' },
      { questionId: 'md_q4', optionId: 'c' },
      { questionId: 'md_q5', optionId: 'b' },
    ]);
    expect(card.vector.experienceTendency).toBeGreaterThan(0.5);
    expect(card.budgetRangeMax).toBeDefined();
  });

  it('cosine similarity is 1 for identical vectors', () => {
    const v = {
      experienceTendency: 0.8,
      qualityTendency: 0.3,
      timeValueTendency: 0.5,
      socialScarcityTendency: 0.2,
    };
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });
});
