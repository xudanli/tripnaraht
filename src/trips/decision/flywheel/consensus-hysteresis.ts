import type { CalibrationSignal } from '../../../decision/kernel/flywheel-risk-feedback';

export type ConsensusSignal = CalibrationSignal & {
  at?: string;
  userId?: string;
  contextKey?: string;
};

export type ConsensusLatchState = {
  isEmergency: boolean;
  /** last observed INCREASE timestamp (ms) within this contextKey */
  lastIncreaseAtMs?: number;
  /** accumulated unique DECREASE users since last increase (weak "recovery" evidence) */
  decreaseUsers?: string[];
};

export type ConsensusHysteresisOptions = {
  contextKey: string;
  nowMs: number;
  enterWindowHours: number; // default 6
  enterMinUsers: number; // default 3
  exitQuietHours: number; // default 12
  exitMinDecreaseUsers: number; // default 2
};

export type ConsensusDecision = {
  state: ConsensusLatchState;
  reason?: string;
};

function parseMs(at?: string): number | undefined {
  if (!at) return undefined;
  const t = Date.parse(String(at));
  return Number.isFinite(t) ? t : undefined;
}

export function updateConsensusLatch(
  prev: ConsensusLatchState | undefined,
  signals: ConsensusSignal[],
  opts: ConsensusHysteresisOptions,
): ConsensusDecision {
  const key = String(opts.contextKey ?? '').trim();
  if (!key) return { state: prev ?? { isEmergency: false } };

  const now = opts.nowMs;
  const enterCutoff = now - opts.enterWindowHours * 3600_000;
  const exitCutoff = now - opts.exitQuietHours * 3600_000;

  const recent = signals.filter((s) => String(s.contextKey ?? '').trim() === key);

  // Enter rule: within last enterWindowHours, >= enterMinUsers unique INCREASE users.
  const incUsers = new Set<string>();
  for (const s of recent) {
    const t = parseMs(s.at);
    if (t === undefined || t < enterCutoff) continue;
    if (s.direction !== 'INCREASE') continue;
    const uid = String(s.userId ?? '').trim();
    if (uid) incUsers.add(uid);
  }
  const enterTriggered = incUsers.size >= opts.enterMinUsers;

  // Track last INCREASE time within exit window (used to cool down).
  let lastIncreaseAtMs = prev?.lastIncreaseAtMs;
  for (const s of recent) {
    const t = parseMs(s.at);
    if (t === undefined || t < exitCutoff) continue;
    if (s.direction === 'INCREASE') {
      lastIncreaseAtMs = Math.max(lastIncreaseAtMs ?? 0, t);
    }
  }

  const prevDecrease = new Set((prev?.decreaseUsers ?? []).map((u) => String(u)));
  const decreaseUsers = new Set<string>(prevDecrease);
  for (const s of recent) {
    const t = parseMs(s.at);
    if (t === undefined || t < exitCutoff) continue;
    if (s.direction !== 'DECREASE') continue;
    const uid = String(s.userId ?? '').trim();
    if (uid) decreaseUsers.add(uid);
  }

  // State transition
  if (enterTriggered) {
    return {
      state: {
        isEmergency: true,
        lastIncreaseAtMs: now,
        decreaseUsers: [],
      },
      reason: `[紧急] 近 ${opts.enterWindowHours} 小时同一分箱内 ${incUsers.size} 位独立用户一致上报风险上升，进入极端安全模式。`,
    };
  }

  if (prev?.isEmergency) {
    const quietEnough = lastIncreaseAtMs !== undefined ? now - lastIncreaseAtMs >= opts.exitQuietHours * 3600_000 : true;
    const hasRecovery = decreaseUsers.size >= opts.exitMinDecreaseUsers;
    if (quietEnough && hasRecovery) {
      return {
        state: { isEmergency: false, lastIncreaseAtMs, decreaseUsers: [...decreaseUsers] },
        reason: `紧急态解除：近 ${opts.exitQuietHours} 小时无新增 INCREASE 且有 ${decreaseUsers.size} 条 DECREASE 恢复信号。`,
      };
    }
    return {
      state: { isEmergency: true, lastIncreaseAtMs, decreaseUsers: [...decreaseUsers] },
      reason: `紧急态冷却中：需满足近 ${opts.exitQuietHours} 小时无新增 INCREASE 且 ≥${opts.exitMinDecreaseUsers} 条 DECREASE。`,
    };
  }

  return { state: { isEmergency: false, lastIncreaseAtMs, decreaseUsers: [...decreaseUsers] } };
}

