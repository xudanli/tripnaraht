/**
 * PD-5 — Proactive synthesis output (CGUS product entry).
 * Aligns with reminder card L3 + Intervention scoring fields.
 */

import type { ProactiveDecisionCaseId } from '../contracts/proactive-decision-case.types';
import type { ProactiveLensId } from '../lenses/lens-activation.types';
import type { HardGateVerdict } from '../lenses/lens-activation.types';

export const PROACTIVE_SYNTHESIS_SCHEMA_ID = 'nara.proactive_synthesis@v1' as const;

export type ProactiveOptionId =
  | 'OPT_KEEP_ORIGINAL'
  | 'OPT_POSTPONE_NEXT_WINDOW'
  | 'OPT_INDOOR_SUBSTITUTE'
  | 'OPT_REROUTE'
  | 'OPT_CANCEL_ACTIVITY';

export type ProactiveLensScoresV1 = {
  /** Abu */
  feasibility?: number; // 0..1
  risk?: number; // 0..1 higher = worse
  abuVerdict?: HardGateVerdict;
  /** Dr.Dre */
  experienceScore?: number; // 0..1
  loadScore?: number; // 0..1 higher = more load
  utility?: number; // 0..1
  /** Neptune */
  repairQuality?: number; // 0..1
};

export type ProactiveSynthesisCandidateV1 = {
  optionId: ProactiveOptionId;
  titleZh: string;
  summaryZh: string;
  benefitsZh: string[];
  /** Which lenses contributed this option */
  producedBy: ProactiveLensId[];
  scores: ProactiveLensScoresV1;
  /** Soft utility used for ranking (pre-verify) */
  utility?: number;
  feasible: boolean;
};

export type ProactiveRecommendedOptionV1 = {
  optionId: ProactiveOptionId;
  titleZh: string;
  summaryZh: string;
  benefitsZh: string[];
};

/** L3 card slice */
export type ProactiveSurfaceL3V1 = {
  suggestionZh: string;
  benefitsZh: string[];
};

export type ProactiveSynthesisV1 = {
  schemaId: typeof PROACTIVE_SYNTHESIS_SCHEMA_ID;
  version: 1;
  caseId: ProactiveDecisionCaseId;
  lensActivated: ProactiveLensId[];
  recommended: ProactiveRecommendedOptionV1;
  confidence: number;
  reasonZh: string;
  impactZh: string;
  rankedOptions: ProactiveSynthesisCandidateV1[];
  /** Intervention Value factors (PD-6 consumes) */
  improvement: number;
  actionability: number;
  surfaceL3: ProactiveSurfaceL3V1;
  hardGate: {
    abuVerdict: HardGateVerdict;
    passed: boolean;
  };
  /** Ranking engine used */
  rankingEngine: 'DETERMINISTIC_CGUS_SHAPED' | 'CGUS_SEARCH';
};
