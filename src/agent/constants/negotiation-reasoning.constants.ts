/** Machine-readable tags for Strategy Transparency / causal disclosure on negotiation alternatives. */
export const NEGOTIATION_REASONING_TAG = {
  /** Cross-trip rollback stats led to down-ranking this path (still surfaced so the user sees we respect their pattern). */
  TAILORED_TO_YOUR_PREFERENCE: 'TAILORED_TO_YOUR_PREFERENCE',
  /** Timeline / hard-booking buffer fragility after this option. */
  REAL_TIME_RISK_WARNING: 'REAL_TIME_RISK_WARNING',
  /** Trip-local: user physically rolled back from this alternative recently. */
  ROLLBACK_MEMORY: 'ROLLBACK_MEMORY',
} as const;

export type NegotiationReasoningTag =
  (typeof NEGOTIATION_REASONING_TAG)[keyof typeof NEGOTIATION_REASONING_TAG];
