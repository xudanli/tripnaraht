import type {
  ActiveRisk,
  ExecutionGate,
  ExecutionRiskSummaryDto,
  RiskLevel,
  RiskLifecycleStatus,
} from '../types/execution-risk.types';

const LEVEL_ORDER: Record<RiskLevel, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

const GATE_ORDER: Record<ExecutionGate, number> = {
  ALLOW: 1,
  AT_RISK: 2,
  REPLAN_REQUIRED: 3,
  STOP: 4,
};

export function maxRiskLevel(levels: RiskLevel[]): RiskLevel {
  if (levels.length === 0) return 'LOW';
  return levels.reduce((max, cur) => (LEVEL_ORDER[cur] > LEVEL_ORDER[max] ? cur : max), 'LOW');
}

export function maxExecutionGate(gates: ExecutionGate[]): ExecutionGate {
  if (gates.length === 0) return 'ALLOW';
  return gates.reduce((max, cur) => (GATE_ORDER[cur] > GATE_ORDER[max] ? cur : max), 'ALLOW');
}

export function isActiveLifecycle(status: RiskLifecycleStatus): boolean {
  return status === 'DETECTED' || status === 'ACTIVE' || status === 'ESCALATED' || status === 'MITIGATED';
}

export function isRiskExpired(risk: Pick<ActiveRisk, 'validUntil' | 'lifecycleStatus'>, now = Date.now()): boolean {
  if (risk.lifecycleStatus === 'EXPIRED' || risk.lifecycleStatus === 'RESOLVED') return true;
  if (!risk.validUntil) return false;
  const until = Date.parse(risk.validUntil);
  return !Number.isNaN(until) && until < now;
}

export interface SummaryUpgradeContext {
  activeRisks: ActiveRisk[];
  now?: number;
}

/** P0 deterministic summary aggregation — no weighted scoring */
export function computeOverallLevel(ctx: SummaryUpgradeContext): RiskLevel {
  const now = ctx.now ?? Date.now();
  const active = ctx.activeRisks.filter(
    (r) => isActiveLifecycle(r.lifecycleStatus) && !isRiskExpired(r, now),
  );
  let level = maxRiskLevel(active.map((r) => r.level));

  const highOnSameActivity = countHighOnSharedScope(active, 'activity');
  if (highOnSameActivity >= 2 && LEVEL_ORDER[level] < LEVEL_ORDER.HIGH) {
    level = 'HIGH';
  }

  const imminenceUpgrade = active.some((r) => {
    if (!r.impactStartAt) return false;
    const start = Date.parse(r.impactStartAt);
    return !Number.isNaN(start) && start - now <= 60 * 60 * 1000;
  });
  if (imminenceUpgrade && LEVEL_ORDER[level] < LEVEL_ORDER.HIGH) {
    level = 'HIGH';
  }

  const stopPresent = active.some((r) => r.executionGate === 'STOP');
  if (stopPresent) {
    level = 'CRITICAL';
  }

  return level;
}

export function computeExecutionGateFromRisks(risks: ActiveRisk[]): ExecutionGate {
  return maxExecutionGate(
    risks
      .filter((r) => isActiveLifecycle(r.lifecycleStatus))
      .map((r) => r.executionGate ?? gateFromLevel(r.level)),
  );
}

export function gateFromLevel(level: RiskLevel): ExecutionGate {
  switch (level) {
    case 'CRITICAL':
      return 'STOP';
    case 'HIGH':
      return 'REPLAN_REQUIRED';
    case 'MEDIUM':
      return 'AT_RISK';
    default:
      return 'ALLOW';
  }
}

function countHighOnSharedScope(risks: ActiveRisk[], kind: 'activity' | 'route_segment'): number {
  const high = risks.filter((r) => r.level === 'HIGH' || r.level === 'CRITICAL');
  const byScope = new Map<string, number>();
  for (const risk of high) {
    const refs = kind === 'activity' ? risk.affectedActivities : risk.affectedRouteSegments;
    for (const ref of refs) {
      byScope.set(ref.id, (byScope.get(ref.id) ?? 0) + 1);
    }
  }
  return Math.max(0, ...byScope.values());
}

export function aggregateImpactWindows(
  risks: ActiveRisk[],
): ExecutionRiskSummaryDto['impactWindows'] {
  const windows: Array<{ startAt: string; endAt: string }> = [];
  for (const risk of risks) {
    if (!risk.impactStartAt) continue;
    windows.push({
      startAt: risk.impactStartAt,
      endAt: risk.impactEndAt ?? risk.impactStartAt,
    });
  }
  return mergeWindows(windows);
}

function mergeWindows(
  windows: Array<{ startAt: string; endAt: string }>,
): Array<{ startAt: string; endAt: string }> {
  if (windows.length === 0) return [];
  const sorted = [...windows].sort(
    (a, b) => Date.parse(a.startAt) - Date.parse(b.startAt),
  );
  const merged: Array<{ startAt: string; endAt: string }> = [];
  for (const w of sorted) {
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push({ ...w });
      continue;
    }
    const gap = Date.parse(w.startAt) - Date.parse(last.endAt);
    if (gap <= 30 * 60 * 1000) {
      if (Date.parse(w.endAt) > Date.parse(last.endAt)) {
        last.endAt = w.endAt;
      }
    } else {
      merged.push({ ...w });
    }
  }
  return merged;
}

export function defaultSummaryText(level: RiskLevel, gate: ExecutionGate): string {
  if (gate === 'STOP') return '存在严重执行阻断，请立即处理';
  if (level === 'CRITICAL' || level === 'HIGH') return '请密切关注天气与路况变化';
  if (level === 'MEDIUM') return '部分行程可能受影响，建议提前调整节奏';
  return '今日整体风险较低，请保持关注';
}
