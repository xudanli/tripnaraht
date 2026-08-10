import { TRIP_CONVERSATION_CONTEXT_SCHEMA_ID } from './conversation-turn-result.constants';
import type { TripConversationContextSnapshotV1 } from './conversation-turn-result.types';
import { resolveConversationLifecycle } from './resolve-conversation-lifecycle.util';

export type BuildTripConversationContextInput = {
  trip_id: string;
  trip_status?: string | null;
  plan_version?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  timezone?: string | null;
  today_ymd?: string | null;
  destination?: string | null;
  location_summary_zh?: string | null;
  day_count?: number | null;
  member_count?: number | null;
  fitness_submitted_count?: number | null;
  fitness_pending_count?: number | null;
  vehicle_type?: string | null;
  open_risk_count?: number | null;
  open_decision_count?: number | null;
  unresolved_risks_zh?: string[];
  open_decisions_zh?: string[];
};

/**
 * 构建 TripConversationContextSnapshot（Phase 2）。
 */
export function buildTripConversationContextSnapshot(
  input: BuildTripConversationContextInput,
): TripConversationContextSnapshotV1 {
  const lifecycle = resolveConversationLifecycle({
    tripStatus: input.trip_status,
    startDate: input.start_date,
    endDate: input.end_date,
    todayYmd: input.today_ymd,
  });

  return {
    schema_id: TRIP_CONVERSATION_CONTEXT_SCHEMA_ID,
    trip_id: input.trip_id,
    plan_version: input.plan_version ?? null,
    lifecycle,
    trip_status: input.trip_status ?? null,
    start_date: input.start_date ?? null,
    end_date: input.end_date ?? null,
    timezone: input.timezone ?? null,
    today_ymd: input.today_ymd ?? null,
    destination: input.destination ?? null,
    location_summary_zh: input.location_summary_zh ?? null,
    day_count: input.day_count ?? null,
    member_count: input.member_count ?? null,
    fitness_submitted_count: input.fitness_submitted_count ?? null,
    fitness_pending_count: input.fitness_pending_count ?? null,
    vehicle_type: input.vehicle_type ?? null,
    open_risk_count: input.open_risk_count ?? null,
    open_decision_count: input.open_decision_count ?? null,
    unresolved_risks_zh: input.unresolved_risks_zh ?? [],
    open_decisions_zh: input.open_decisions_zh ?? [],
  };
}
