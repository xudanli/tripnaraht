import type { TripWorldState } from '../decision/world-model';

/**
 * 将 Prisma `Trip.id` 绑定到世界状态：写入 `signals.ecoLedgerTripId`，并在已有 `context` 时写入 `context.tripId`。
 * 用于 HTTP 控制器、Readiness AI、`TripWorldState` 组装等；不伪造最小 `context`，稀疏 state（如冲突检测）可只带信号。
 */
export function applyPrismaTripIdToWorldState(state: TripWorldState, tripId?: string): void {
  if (!tripId) return;
  const now = new Date().toISOString();
  state.signals = {
    ...(state.signals ?? {}),
    lastUpdatedAt: state.signals?.lastUpdatedAt ?? now,
    ecoLedgerTripId: tripId,
  };
  if (state.context) {
    state.context.tripId = tripId;
  }
}
