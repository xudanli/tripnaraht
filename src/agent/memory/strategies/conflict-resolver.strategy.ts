import { Injectable } from '@nestjs/common';

export type MemoryScope = 'LONG_TERM' | 'SESSION';

export interface MemoryAtom<T> {
  scope: MemoryScope;
  value: T;
  /** [0,1] */
  confidence: number;
  /** ISO 8601 */
  updatedAt: string;
  /** Optional half-life in days for confidence decay */
  halfLifeDays?: number;
  /** Provenance should be non-PII; keep it short */
  provenance?: { source: string; evidenceId?: string };
}

export interface ConflictResolution<T> {
  winner: MemoryAtom<T>;
  loser?: MemoryAtom<T>;
  /**
   * [0,1] contradiction score. High when session overrides strong long-term.
   * Used for auditing and extractor feedback loops.
   */
  contradictionScore: number;
  /** Auditable factors used for resolution */
  factors: {
    sessionPreferred: boolean;
    longTermDecayedConfidence?: number;
    sessionConfidence?: number;
    halfLifeDaysUsed?: number;
    ageDaysLongTerm?: number;
  };
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function ageDays(nowMs: number, iso: string): number | undefined {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return undefined;
  return Math.max(0, (nowMs - t) / (1000 * 60 * 60 * 24));
}

/**
 * Decay curve: confidence' = confidence * 0.5^(age/halfLife)
 * - halfLifeDays<=0 or missing → no decay.
 */
export function applyHalfLifeDecay(baseConfidence: number, ageDaysValue: number, halfLifeDays?: number): number {
  const c = clamp01(baseConfidence);
  if (!halfLifeDays || !Number.isFinite(halfLifeDays) || halfLifeDays <= 0) return c;
  const decay = Math.pow(0.5, ageDaysValue / halfLifeDays);
  return clamp01(c * decay);
}

@Injectable()
export class ConflictResolverStrategy {
  /**
   * Invariant:
   * - If SESSION exists and conflicts with LONG_TERM, SESSION wins.
   * - Contradiction score increases when long-term is strong (after decay) but overridden.
   */
  resolve<T>(params: { session?: MemoryAtom<T>; longTerm?: MemoryAtom<T>; now?: Date }): ConflictResolution<T> | undefined {
    const { session, longTerm } = params;
    if (!session && !longTerm) return undefined;
    if (session && !longTerm) {
      return {
        winner: session,
        contradictionScore: 0,
        factors: { sessionPreferred: true, sessionConfidence: clamp01(session.confidence) },
      };
    }
    if (!session && longTerm) {
      return {
        winner: longTerm,
        contradictionScore: 0,
        factors: { sessionPreferred: false, longTermDecayedConfidence: clamp01(longTerm.confidence) },
      };
    }

    // Both exist
    const nowMs = (params.now ?? new Date()).getTime();
    const longAge = ageDays(nowMs, longTerm!.updatedAt);
    const halfLife = longTerm!.halfLifeDays;
    const longDecayed =
      longAge !== undefined ? applyHalfLifeDecay(longTerm!.confidence, longAge, halfLife) : clamp01(longTerm!.confidence);
    const sessionC = clamp01(session!.confidence);

    const conflicts = session!.value !== longTerm!.value;

    if (!conflicts) {
      // same value: pick higher confidence but no contradiction
      const winner = sessionC >= longDecayed ? session! : longTerm!;
      return {
        winner,
        loser: winner === session ? longTerm : session,
        contradictionScore: 0,
        factors: {
          sessionPreferred: winner.scope === 'SESSION',
          longTermDecayedConfidence: longDecayed,
          sessionConfidence: sessionC,
          halfLifeDaysUsed: halfLife,
          ageDaysLongTerm: longAge,
        },
      };
    }

    // Conflict invariant: session wins
    const contradictionScore = clamp01(longDecayed * (1 - sessionC * 0.25));
    return {
      winner: session!,
      loser: longTerm!,
      contradictionScore,
      factors: {
        sessionPreferred: true,
        longTermDecayedConfidence: longDecayed,
        sessionConfidence: sessionC,
        halfLifeDaysUsed: halfLife,
        ageDaysLongTerm: longAge,
      },
    };
  }
}

