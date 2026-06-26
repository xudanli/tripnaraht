/**
 * 确认页「为什么推荐」— plannerResponseBlocks
 */

import type { ExperienceExplanationCard } from '../types/experience-explanation.types';
import type { WhyRecommendedPlannerBlock } from '../types/itinerary-presentation.types';

export function buildWhyRecommendPlannerBlocks(
  explanation: ExperienceExplanationCard,
): WhyRecommendedPlannerBlock[] {
  if (!explanation.whyRecommended.length && !explanation.overallSummary) {
    return [];
  }

  const bullets = [
    ...explanation.whyRecommended,
    ...(explanation.risks.length ? [`需注意：${explanation.risks[0]}`] : []),
    ...(explanation.planBHints.length ? [`备选思路：${explanation.planBHints[0]}`] : []),
  ].slice(0, 6);

  return [
    {
      type: 'why_recommended',
      title: '为什么推荐这样安排',
      bullets,
      overallLabel: explanation.overallLabelZh,
      overallSummary: explanation.overallSummary,
      dimensions: {
        routeFeasibility: `${explanation.dimensions.routeFeasibility.labelZh} — ${explanation.dimensions.routeFeasibility.detail}`,
        experienceMatch: `${explanation.dimensions.experienceMatch.labelZh} — ${explanation.dimensions.experienceMatch.detail}`,
        changingFactors: explanation.dimensions.changingFactors.factors,
      },
    },
  ];
}
