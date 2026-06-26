/** Decision DNA 信号分级 — PIPL / 不乱来 合规合同 */

export type DecisionDnaSignalTier = 'EXPLICIT' | 'IMPLICIT_WITH_CONSENT' | 'FORBIDDEN';

export type DecisionDnaEvolutionReason = 'NEGOTIATION_CONFIRMED' | 'NEGOTIATION_ROLLED_BACK';

export type DecisionDnaSignalSource =
  | 'USER_CONFIRMED_CHOICE'
  | 'ROLLBACK_AGGREGATE'
  | 'INFERRED_TRAIT';

export const REASON_TO_SIGNAL_SOURCE: Record<DecisionDnaEvolutionReason, DecisionDnaSignalSource> = {
  NEGOTIATION_CONFIRMED: 'USER_CONFIRMED_CHOICE',
  NEGOTIATION_ROLLED_BACK: 'ROLLBACK_AGGREGATE',
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
