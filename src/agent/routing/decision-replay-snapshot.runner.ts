/**
 * DecisionReplay 自动快照开关与触发（从 ClaudeOrchestrator 迁出）。
 */

import type { DecisionReplaySnapshotHost } from './decision-replay-snapshot.host';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';

export function isDecisionReplayAutoSnapshotEnabled(
  host: DecisionReplaySnapshotHost,
): boolean {
  const v =
    host.configService?.get<string>('DECISION_REPLAY_AUTO_SNAPSHOT') ??
    process.env.DECISION_REPLAY_AUTO_SNAPSHOT ??
    'false';
  return v === 'true' || v === '1';
}

export function maybeSnapshot(
  host: DecisionReplaySnapshotHost,
  state: OrchestratorState,
  trigger: 'AUTO' | 'USER_ACTION' | 'CHECKPOINT',
): void {
  if (!host.decisionReplay) return;
  if (!isDecisionReplayAutoSnapshotEnabled(host)) return;
  try {
    host.decisionReplay.createSnapshot(state, trigger);
  } catch (e: any) {
    host.logger.warn(`[Claude Orchestrator] DecisionReplay snapshot failed: ${e?.message}`);
  }
}
