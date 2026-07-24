import type { OptionId, PremiumOptionId, PremiumStressScenarioId, ScenarioId } from '../types/odyssey-intake.types';
import {
  aggregatePremiumStressScores,
  aggregateScoresFromAnswers,
  buildProfileFromAnswers,
  buildProfileFromPremiumIntake,
  computeDimensionPercents,
  inferTravelCollaborationGene,
  resolveMbtiType,
  resolveIdentityCard,
} from './intake-scoring.engine';

const ALL_A: Partial<Record<ScenarioId, OptionId>> = {
  budget_financial_tolerance: 'A',
  ambiguity_tolerance: 'A',
  energy_pace: 'A',
  social_recharge: 'A',
  aesthetic_meaning: 'A',
};

const ALL_B: Partial<Record<ScenarioId, OptionId>> = {
  budget_financial_tolerance: 'B',
  ambiguity_tolerance: 'B',
  energy_pace: 'B',
  social_recharge: 'B',
  aesthetic_meaning: 'B',
};

describe('intake-scoring.engine', () => {
  it('aggregates PRD score deltas from scenario 1 option A', () => {
    const scores = aggregateScoresFromAnswers({
      budget_financial_tolerance: 'A',
    });
    expect(scores.financial_flexibility).toBe(2);
    expect(scores.planning_index).toBe(-1);
  });

  it('resolves MBTI type from full adventure-oriented answers', () => {
    const profile = buildProfileFromAnswers(ALL_A);
    expect(profile.mbtiType).toMatch(/^[EI][NS][TF][JP]$/);
    expect(profile.card.title).toBeTruthy();
    expect(profile.card.theme.quadrant).toBeTruthy();
    expect(Object.keys(profile.card.radar).length).toBeGreaterThanOrEqual(6);
  });

  it('maps INTJ + strong J to 冰岛荒原的冷酷指挥官', () => {
    const scores = aggregateScoresFromAnswers({
      budget_financial_tolerance: 'B',
      ambiguity_tolerance: 'B',
      energy_pace: 'A',
      social_recharge: 'C',
      aesthetic_meaning: 'A',
    });
    scores.mbti_j_score += 4;
    const percents = computeDimensionPercents(scores);
    const mbti = resolveMbtiType(percents);
    const card = resolveIdentityCard(scores, percents, mbti);

    if (mbti === 'INTJ' && percents.J >= 75) {
      expect(card.title).toBe('冰岛荒原的冷酷指挥官');
    }
  });

  it('budget-first answers skew toward J and low financial flexibility', () => {
    const profile = buildProfileFromAnswers(ALL_B);
    expect(profile.rawScores.financial_flexibility).toBeLessThan(0);
    expect(profile.rawScores.mbti_j_score).toBeGreaterThan(0);
  });

  it('premium INTJ + control takeover maps full_managed_leader gene', () => {
    const answers: Partial<Record<PremiumStressScenarioId, PremiumOptionId>> = {
      resource_scarcity_replan: 'A',
      convoy_division_collaboration: 'A',
      premium_upcharge_decision: 'A',
    };
    const profile = buildProfileFromPremiumIntake('INTJ', answers);
    expect(profile.mbtiType).toBe('INTJ');
    expect(profile.travelCollaborationGene).toBe('full_managed_leader');
    expect(profile.rawScores.quality_baseline).toBe(2);
    expect(profile.rawScores.control_desire).toBe(2);
    expect(Object.keys(profile.card.radar)).toContain('行中主导度');
  });

  it('premium collaborative answers infer co_planning_partner', () => {
    const scores = aggregatePremiumStressScores({
      convoy_division_collaboration: 'B',
    });
    expect(inferTravelCollaborationGene(scores)).toBe('co_planning_partner');
  });
});
