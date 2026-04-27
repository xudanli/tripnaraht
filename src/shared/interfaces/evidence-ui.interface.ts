/**
 * TripNARA Iron Shield — visual contract for evidence cards (payload → pixels).
 * Tier drives information density, not copy alone: minimalist → analytical → authoritative.
 */

export type EvidenceCardKind = 'iron_shield_evidence';

export type EvidencePersuasionTier = 1 | 2 | 3;

/** Maps to iconography + chroma (Tailwind token groups on the client). */
export type EvidenceCardTheme = 'solar' | 'weather' | 'road';

/** Layout mode derived from tier (stable mapping for Storybook / playground). */
export type EvidenceTierLayout = 'minimalist' | 'analytical' | 'authoritative';

export interface EvidenceCardImpactUI {
  /** Hours (from wall-hit latency), for Tier 2+ loss framing */
  hours: number;
  label: string;
}

export interface EvidenceCardSocialProofUI {
  count: number;
  percentage: number;
}

export interface EvidenceCardPolicyReferenceUI {
  ruleId: string;
  ruleName?: string;
}

export interface EvidenceCardUIProps {
  kind: EvidenceCardKind;
  tier: EvidencePersuasionTier;
  layout: EvidenceTierLayout;
  theme: EvidenceCardTheme;
  /** Primary line: prefer narrator_hint_rendered on the wire */
  title: string;
  /** Primary metric, e.g. "25.0 m/s" or "Sunset 16:30 + 60m" */
  valueDisplay: string;
  /** Provenance chip, e.g. "segment_prediction" */
  sourceLabel?: string;
  /** Secondary line vs threshold / buffer, e.g. "Threshold: 15.0 m/s" */
  benchmark?: string;
  impact?: EvidenceCardImpactUI;
  socialProof?: EvidenceCardSocialProofUI;
  policyReference?: EvidenceCardPolicyReferenceUI;
  flags?: { data_anomaly?: boolean };
}
