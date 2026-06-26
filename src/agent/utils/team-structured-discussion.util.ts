import {
  detectDecisionNodesFromText,
  pickPrimaryDecisionNode,
} from '../../trips/process-fairness/utils/decision-node-detection.util';
import {
  DECISION_NODE_TO_DOMAIN,
  type DecisionNode,
} from '../../trips/process-fairness/types/preference-round.types';
import type { ProcessFairnessOrchestrationHint } from '../../trips/process-fairness/types/process-fairness-orchestration.types';
import type { TripConsultationSuggestedOperation } from './trip-consultation-suggested-operations.util';
import { wishCategoryLabel } from '../../trips/wishlist/utils/wish-category.util';

/** 用户显式请求「帮团队结构化讨论/协商」且命中决策节点关键词 */
const TEAM_STRUCT_DISCUSS_RE =
  /(?:帮|协助|引导)?(?:团队|大家|我们).{0,12}(?:结构化)?(?:讨论|协商|表决|对齐)|(?:结构化).{0,8}(?:讨论|协商|对齐)/i;

export function isTeamStructuredDiscussionQuery(msg: string): boolean {
  const t = msg.trim();
  if (!t) return false;
  if (!TEAM_STRUCT_DISCUSS_RE.test(t)) return false;
  return detectDecisionNodesFromText(t).length > 0;
}

export function primaryDecisionNodeFromMessage(msg: string): DecisionNode | null {
  return pickPrimaryDecisionNode(detectDecisionNodesFromText(msg));
}

export function buildTeamStructuredDiscussionAnswer(args: {
  message: string;
  tripName?: string | null;
  memberCount: number;
  hint: ProcessFairnessOrchestrationHint;
}): string {
  const { message, tripName, memberCount, hint } = args;

  /** 轮次已开启或 orchestrator 已给出开场白：协商卡片承载细节，对话区仅保留短文案。 */
  if (hint.agentIntroZh?.trim()) {
    return hint.agentIntroZh.trim();
  }

  const node = hint.decisionNode ?? primaryDecisionNodeFromMessage(message);
  const domain = node ? DECISION_NODE_TO_DOMAIN[node] : null;
  const label = domain ? wishCategoryLabel(domain as Parameters<typeof wishCategoryLabel>[0]) : '本议题';
  const tripPrefix = tripName?.trim() ? `针对行程「${tripName.trim()}」，` : '';

  if (hint.skippedReason === 'single_member_trip' || memberCount < 2) {
    if (hint.agentIntroZh?.trim()) {
      return hint.agentIntroZh.trim();
    }
    return (
      `${tripPrefix}当前仅有 **${memberCount}** 位成员，暂无法开启「${label}」的多人协商轮次。` +
      `请先**邀请协作者**，或在左侧「结构化协商」手动发起。`
    );
  }

  if (hint.skippedReason) {
    return (
      `${tripPrefix}「${label}」的结构化轮次暂未启动（${hint.skippedReason}）。` +
      `请在「结构化协商」手动发起，或稍后再试。`
    );
  }

  return `${tripPrefix}请点击下方「进入结构化协商」，在卡片中按 Round Robin 顺序讨论「${label}」。`;
}

export function buildProcessFairnessSuggestedOperations(
  hint: ProcessFairnessOrchestrationHint,
): TripConsultationSuggestedOperation[] {
  const nav = hint.clientNavigation;
  if (!nav?.roundId) {
    return [];
  }
  /** 前端已从 `process_fairness.round` 渲染内联协商卡片，勿再下发「进入结构化协商」快捷入口。 */
  if (hint.triggered && hint.round) {
    return [];
  }
  return [
    {
      id: `nav_process_fairness_${nav.domain ?? 'discussion'}`,
      label: '进入结构化协商',
      kind: 'client_navigation',
      payload: { ...nav },
    },
  ];
}
