/**
 * P24 — Self-nullification: stable autonomous observation reduces systemic intervention need.
 */

export interface SelfNullificationState {
  /** Remaining “system presence” [0,1] — low means fade toward observational-only. */
  systemActivityLevel: number;
  interventionIntensity: number;
  autonomySufficiencyScore: number;
  /** Combined stability + autonomy pressure toward retiring mediation [0,1]. */
  nullificationPressure: number;
}

export type SystemOperationalRole = 'ACTIVE_CONTROL' | 'ADVISORY_ONLY' | 'PASSIVE_MONITOR';

export type FadeOutDirective = {
  reduceIR?: boolean;
  reduceDAG?: boolean;
  reduceVM?: boolean;
};

export type SystemTerminalMode =
  /** Normal closed-loop execution. */
  | 'ACTIVE'
  /** Low activity — evaluator-only posture. */
  | 'DORMANT'
  /** Hints without commanding IR/DAG mutation. */
  | 'ADVISORY_ONLY'
  /** Recording-only — no executable outputs. */
  | 'NULL';
