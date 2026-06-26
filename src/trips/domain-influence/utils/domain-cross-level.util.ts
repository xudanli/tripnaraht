import type { WishCategory } from '../../wishlist/types/trip-wish.types';
import type { DomainCrossLevel, DomainDecisionRule } from '../types/trip-domain.types';

/** F2.3 — static cross-level registry (transparent before planning starts). */
export const DOMAIN_CROSS_LEVEL: Record<WishCategory, DomainCrossLevel> = {
  destination_route: 'high',
  main_transport: 'low',
  accommodation: 'medium',
  activities: 'high',
  dining: 'medium',
  local_transport: 'low',
  shopping: 'low',
  insurance_visa: 'low',
};

const RULE_LABELS: Record<DomainCrossLevel, string> = {
  low: '专家主导 / 低冲突风险',
  medium: '中交叉领域 / 专家提案 + 团队投票',
  high: '高交叉领域 / 需团队全员共识',
};

export function getDomainDecisionRule(domain: WishCategory): DomainDecisionRule {
  const crossLevel = DOMAIN_CROSS_LEVEL[domain];
  return {
    crossLevel,
    ruleLabelZh: RULE_LABELS[crossLevel],
    expertCanDecideAlone: crossLevel === 'low',
    requiresTeamVote: crossLevel === 'medium',
    requiresFullTeamDiscussion: crossLevel === 'high',
  };
}
