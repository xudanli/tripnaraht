/**
 * 将 TripConversationContextSnapshot / G2P session 挂在 route_and_run 请求上，供 Assembler 读取。
 * 仅进程内传递，不依赖 OpenAPI meta 白名单。
 */
import type { TripConversationContextSnapshotV1 } from './conversation-turn-result.types';

const CONTEXT_KEY = '__trip_conversation_context_v1' as const;
const G2P_KEY = '__guide_to_plan_session_v1' as const;

export type GuideToPlanSessionCarrier = {
  session_id: string;
  summary_zh: string;
  status: 'stub' | 'parsed' | 'matched' | 'conflict' | 'ready_to_write';
  matched_day_iso?: string;
  conflicts_zh?: string[];
  missing_zh?: string[];
  source_hint?: string;
};

export function attachTripConversationContextToRequest(
  request: Record<string, unknown>,
  snapshot: TripConversationContextSnapshotV1,
): void {
  (request as any)[CONTEXT_KEY] = snapshot;
}

export function readTripConversationContextFromRequest(
  request: unknown,
): TripConversationContextSnapshotV1 | null {
  if (!request || typeof request !== 'object') return null;
  const fromCarrier = (request as any)[CONTEXT_KEY];
  return fromCarrier && typeof fromCarrier === 'object'
    ? (fromCarrier as TripConversationContextSnapshotV1)
    : null;
}

export function attachGuideToPlanSessionToRequest(
  request: Record<string, unknown>,
  session: GuideToPlanSessionCarrier,
): void {
  (request as any)[G2P_KEY] = session;
}

export function readGuideToPlanSessionFromRequest(
  request: unknown,
): GuideToPlanSessionCarrier | null {
  if (!request || typeof request !== 'object') return null;
  const s = (request as any)[G2P_KEY];
  return s && typeof s === 'object' ? (s as GuideToPlanSessionCarrier) : null;
}
