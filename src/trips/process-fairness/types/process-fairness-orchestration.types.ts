import type { DecisionNode } from './preference-round.types';
import type { PreferenceRoundDetail } from './preference-round.types';

export interface ProcessFairnessOrchestrationHint {
  triggered: boolean;
  /**
   * 前端展示语义（非 HTTP 错误）：
   * - ACTIVE：已关联进行中/新建轮次
   * - SCAFFOLD：仅讨论框架（如单人行程需先邀请成员）
   * - SKIPPED：未触发且无可用框架
   */
  status?: 'ACTIVE' | 'SCAFFOLD' | 'SKIPPED';
  decisionNode: DecisionNode | null;
  roundId: string | null;
  round: PreferenceRoundDetail | null;
  /** Agent 叙述用开场白 */
  agentIntroZh: string | null;
  /** 前端跳转结构化协商页 */
  clientNavigation: {
    route: 'structured_negotiation';
    tripId: string;
    roundId: string;
    domain: string;
  } | null;
  skippedReason?: string;
}
