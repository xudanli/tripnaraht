/** Decision DNA 信号分级 — PIPL / 不乱来 合规合同 */

export type DecisionDnaSignalTier = 'EXPLICIT' | 'IMPLICIT_WITH_CONSENT' | 'FORBIDDEN';

export type DecisionDnaEvolutionReason =
  | 'NEGOTIATION_CONFIRMED'
  | 'NEGOTIATION_ROLLED_BACK'
  | 'TREK_VIBE_CONFIRMED'
  | 'TREK_READINESS_ACK'
  | 'TREK_POST_RATING_FIVE_STAR'
  | 'TASK_CHAIN_CONFIRMED'
  | 'TASK_CHAIN_ROLLED_BACK'
  | 'TASK_CHAIN_TIMEOUT'
  | 'TREK_PHYSICAL_FAILURE'
  | 'SOVEREIGN_FORCE_LOCK';

export type DecisionDnaSignalSource =
  | 'USER_CONFIRMED_CHOICE'
  | 'ROLLBACK_AGGREGATE'
  | 'INFERRED_TRAIT';

export const REASON_TO_SIGNAL_SOURCE: Record<DecisionDnaEvolutionReason, DecisionDnaSignalSource> = {
  NEGOTIATION_CONFIRMED: 'USER_CONFIRMED_CHOICE',
  NEGOTIATION_ROLLED_BACK: 'ROLLBACK_AGGREGATE',
  TREK_VIBE_CONFIRMED: 'USER_CONFIRMED_CHOICE',
  TREK_READINESS_ACK: 'USER_CONFIRMED_CHOICE',
  TREK_POST_RATING_FIVE_STAR: 'INFERRED_TRAIT',
  TASK_CHAIN_CONFIRMED: 'USER_CONFIRMED_CHOICE',
  TASK_CHAIN_ROLLED_BACK: 'ROLLBACK_AGGREGATE',
  TASK_CHAIN_TIMEOUT: 'ROLLBACK_AGGREGATE',
  TREK_PHYSICAL_FAILURE: 'INFERRED_TRAIT',
  SOVEREIGN_FORCE_LOCK: 'USER_CONFIRMED_CHOICE',
};

export const SIGNAL_TIER_REGISTRY: Record<DecisionDnaSignalSource, DecisionDnaSignalTier> = {
  USER_CONFIRMED_CHOICE: 'EXPLICIT',
  ROLLBACK_AGGREGATE: 'IMPLICIT_WITH_CONSENT',
  INFERRED_TRAIT: 'FORBIDDEN',
};

export type DecisionDnaConsentPrefs = {
  implicit_learning?: boolean;
  granted_at?: string;
  revoked_at?: string;
};

export type DecisionDnaComplianceAuditEvent = {
  userId: string;
  reason: DecisionDnaEvolutionReason;
  signalSource: DecisionDnaSignalSource;
  tier: DecisionDnaSignalTier;
  allowed: boolean;
  blockedReason?: string;
  at: string;
};

export type DecisionDnaSyncGateResult = {
  allowed: boolean;
  tier: DecisionDnaSignalTier;
  signalSource: DecisionDnaSignalSource;
  blockedReason?: string;
};

export type DecisionDnaConsentStatus = {
  implicit_learning: boolean;
  granted_at?: string;
  revoked_at?: string;
  explicit_signals_always_allowed: true;
  signal_tiers: typeof SIGNAL_TIER_REGISTRY;
};
