/**
 * iOS 认知主链对接 · TypeScript 参考（镜像 Swift handoff，非运行时依赖）。
 * @see DECISION_COGNITION_IOS_HANDOFF.md
 */

export const COGNITION_UI_CARDS_SCHEMA = 'tripnara.cognition_ui_cards@v1' as const;
export const COGNITION_ECHO_SCHEMA = 'tripnara/cognition_echo@v1' as const;

export type CognitionCardKind =
  | 'REALITY'
  | 'RELATIONS'
  | 'FOCUSED_PROBLEM'
  | 'FUTURE'
  | 'AUTHORIZATION'
  | 'MILESTONE';

export type CognitionUiCard = {
  id: string;
  kind: CognitionCardKind | string;
  title_zh: string;
  body_zh: string;
  severity?: 'info' | 'warn' | 'critical';
  ref?: string;
  cta_zh?: string;
};

export type CognitionUiCards = {
  schema?: typeof COGNITION_UI_CARDS_SCHEMA | string;
  decision_depth?: string;
  markers: string[];
  cards: CognitionUiCard[];
};

export type CognitionEcho = {
  schema?: typeof COGNITION_ECHO_SCHEMA | string;
  decision_depth?: string;
  markers?: string[];
  reality?: {
    snapshotId?: string;
    confidence?: number;
    freshness?: string;
    unknownCount?: number;
  };
  focused_problem?: {
    problemId?: string;
    question?: string;
    gateDisposition?: string;
    whyThisProblem?: string;
  };
  future?: {
    status?: string;
    recommendedAlternativeId?: string;
    alternativeCount?: number;
  };
  admission_audit?: Array<{ phase?: string; ok?: boolean; missing?: string[] }>;
};

/** 从 route_and_run 响应挑出优先渲染的卡片包 */
export function pickCognitionCardsForIos(res: {
  result?: {
    payload?: {
      ui_display?: { cognition_cards?: CognitionUiCards | null } | null;
      cognition?: CognitionEcho | null;
    } | null;
  } | null;
  explain?: {
    decision_cockpit?: {
      cognition_cards?: CognitionUiCards | null;
      cognition?: CognitionEcho | null;
    } | null;
  } | null;
}): CognitionUiCards | undefined {
  const fromUi = res.result?.payload?.ui_display?.cognition_cards;
  if (fromUi?.cards?.length) return fromUi;
  const fromCockpit = res.explain?.decision_cockpit?.cognition_cards;
  if (fromCockpit?.cards?.length) return fromCockpit;
  return undefined;
}

/** 用户确认请求：带 decision_consent */
export function buildDecisionConsentRequest(input: {
  requestId: string;
  userId: string;
  tripId?: string;
  message?: string;
  recentMessages?: string[];
  clarificationAnswers?: Array<{ questionId: string; value: string[] | string }>;
}): Record<string, unknown> {
  return {
    request_id: input.requestId,
    user_id: input.userId,
    ...(input.tripId ? { trip_id: input.tripId } : {}),
    message: input.message ?? '确认按推荐方案继续',
    conversation_context: {
      recent_messages: input.recentMessages ?? [],
      locale: 'zh-CN',
    },
    options: {
      entry_point: 'trip_detail_page',
      execution_mode: 'ADVICE_ONLY',
      decision_consent: true,
    },
    ...(input.clarificationAnswers?.length
      ? { clarification_answers: input.clarificationAnswers }
      : {}),
  };
}

export function shouldPromptDecisionConsent(cards: CognitionUiCards | undefined): boolean {
  if (!cards?.cards?.length) return false;
  return cards.cards.some(
    (c) =>
      c.kind === 'FOCUSED_PROBLEM' &&
      (c.cta_zh?.includes('确认') || c.severity === 'warn' || c.severity === 'critical'),
  );
}
