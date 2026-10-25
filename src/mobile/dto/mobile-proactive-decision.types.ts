/**
 * Mobile BFF — Proactive Decision V1 surface DTO (client contract).
 * @see PROACTIVE_DECISION_IOS_HANDOFF.md
 */

import type { ProactiveReminderCardV1 } from '../../trips/proactive-decision/surface/proactive-reminder-card.types';
import type { ProactiveChangeDraftV1 } from '../../trips/proactive-decision/execution/proactive-change-draft.types';
import type { ProactiveCanaryStage } from '../../trips/proactive-decision/config/proactive-canary-config.util';
import type { ProactiveErcProjectionItemV1 } from '../../trips/proactive-decision/erc/project-proactive-to-erc.util';

export const MOBILE_PROACTIVE_DECISION_SURFACE_SCHEMA =
  'tripnara.mobile_proactive_decision_surface@v1' as const;

export type MobileProactiveDecisionFlagsDto = {
  pushEnabled: false;
  autoApplyEnabled: false;
  confirmApplyWriteEnabled: boolean;
  ercProjectionEnabled: boolean;
};

export type MobileProactiveDecisionSurfaceDto = {
  schemaId: typeof MOBILE_PROACTIVE_DECISION_SURFACE_SCHEMA;
  version: 1;
  tripId: string;
  canaryStage: ProactiveCanaryStage;
  /** L1 Passive 条带（执行首页 / 今日行程） */
  shouldRenderL1Passive: boolean;
  /** L2 打断卡；SHADOW/L1 下为 false */
  shouldRenderCard: boolean;
  l1PassiveBanner: import('../../trips/proactive-decision/surface/proactive-l1-passive-banner.types').ProactiveL1PassiveBannerV1 | null;
  reminderCard: ProactiveReminderCardV1 | null;
  changeDraft: ProactiveChangeDraftV1 | null;
  ercProjection: ProactiveErcProjectionItemV1 | null;
  decisionProblemId: string | null;
  interventionGate: 'NOTIFY_CARD' | 'SILENT_LEARNING' | null;
  /**
   * Decision Trace — Shadow 也可读（解释「为什么」）。
   * 客户端勿把 abu/dre/neptune 名称展示给用户；用 whyExplainZh。
   */
  decisionTrace: import('../../trips/proactive-decision/trace/proactive-decision-trace.types').ProactiveDecisionTraceV1 | null;
  /** L2 High-Value 诊断（未达则打断卡关闭，可降级 L1） */
  l2HighValue: {
    ok: boolean;
    interventionValue: number;
    confidence: number;
    actionability: number;
    reasonsZh: string[];
  } | null;
  flags: MobileProactiveDecisionFlagsDto;
  updatedAt: string | null;
};
