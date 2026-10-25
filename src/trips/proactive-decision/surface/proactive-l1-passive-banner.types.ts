/**
 * Phase 4 P2 — L1 Passive banner (执行首页 / 今日行程被动入口).
 * 不强打断；不展示三人格；不以 Push 起家。
 */

import type { ProactiveDecisionCaseId } from '../contracts/proactive-decision-case.types';

export const PROACTIVE_L1_PASSIVE_BANNER_SCHEMA =
  'nara.proactive_l1_passive_banner@v1' as const;

export type ProactiveL1PassiveBannerV1 = {
  schemaId: typeof PROACTIVE_L1_PASSIVE_BANNER_SCHEMA;
  version: 1;
  tripId: string;
  caseId: ProactiveDecisionCaseId | null;
  decisionProblemId: string | null;
  /** 固定产品文案：不吓人、不强打断 */
  titleZh: string;
  /** 一行摘要：发生了什么（无人格名） */
  summaryZh: string;
  /** 可选：影响什么 */
  impactHintZh: string | null;
  cta: {
    id: 'VIEW_OPTIONS';
    labelZh: string;
  };
  /** Deep link hint for iOS */
  detailPathHint: string;
};
