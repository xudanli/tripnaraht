/**
 * User Attention Context — DRIVING / NAVIGATING / APP_ACTIVE / BACKGROUND 等。
 */

export const USER_ATTENTION_CONTEXT_SCHEMA =
  'nara.user_attention_context@v1' as const;

export type AttentionStateV1 =
  | 'DRIVING'
  | 'NAVIGATING'
  | 'APP_ACTIVE'
  | 'APP_FOREGROUND_IDLE'
  | 'BACKGROUND'
  | 'UNKNOWN';

export type UserAttentionContextV1 = {
  schemaId: typeof USER_ATTENTION_CONTEXT_SCHEMA;
  version: 1;
  tripId: string;
  userId?: string;
  state: AttentionStateV1;
  /** 用户是否刚打开 TripNARA（L1 必要条件） */
  justOpenedApp: boolean;
  capturedAt: string;
  /** 注意力预算剩余（0–1） */
  attentionBudgetRemaining: number;
};

export function buildUserAttentionContext(input: {
  tripId: string;
  state: AttentionStateV1;
  justOpenedApp?: boolean;
  attentionBudgetRemaining?: number;
  userId?: string;
  capturedAt?: string;
}): UserAttentionContextV1 {
  const budget = Math.max(
    0,
    Math.min(1, input.attentionBudgetRemaining ?? 1),
  );
  return {
    schemaId: USER_ATTENTION_CONTEXT_SCHEMA,
    version: 1,
    tripId: input.tripId,
    userId: input.userId,
    state: input.state,
    justOpenedApp: !!input.justOpenedApp,
    capturedAt: input.capturedAt ?? new Date().toISOString(),
    attentionBudgetRemaining: budget,
  };
}
