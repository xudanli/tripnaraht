/** Gate1 顾问面标准信任卡片 — Decision OS「不装真」UI 合同 v1 */

export type TrustConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

export type TrustDataSourceKind =
  | 'HUMAN_ASSISTED'
  | 'SANITIZED_CONSTRAINT'
  | 'CONFLICT_REPORT'
  | 'READINESS'
  | 'ADVISOR'
  | 'SYSTEM';

export type TrustDataSource = {
  id: string;
  label: string;
  kind: TrustDataSourceKind;
  freshness?: string;
};

export type TrustInterventionEffect = {
  targetVariable: string;
  metric: string;
  direction: 'UP' | 'DOWN';
  estimatedMagnitude?: number;
  confidence?: number;
  label?: string;
};

export type TrustAlternative = {
  id: string;
  label: string;
  summary: string;
  confidenceLevel: TrustConfidenceLevel;
  isSelected?: boolean;
  /** P1: 干预 → 效果（Causal Travel Runtime） */
  interventionSummary?: string;
  interventionEffects?: TrustInterventionEffect[];
  causalChain?: string[];
};

export type Gate1TrustCard = {
  cardId: string;
  subjectType: 'CANDIDATE' | 'PLAN_B' | 'DECISION';
  subjectId: string;
  title: string;
  confidence: {
    level: TrustConfidenceLevel;
    score: number | null;
    rationale: string;
  };
  alternatives: TrustAlternative[];
  dataSources: TrustDataSource[];
  machineAesthetic: {
    humanAssisted: boolean;
    humanMinutes: number | null;
    disclaimer: string;
  };
  updatedAt: string;
};

export type Gate1TrustSurfaceSummary = {
  totalCards: number;
  highConfidenceCount: number;
  humanAssistedCount: number;
};

export type Gate1TrustSurface = {
  projectId: string;
  schemaVersion: 1;
  cards: Gate1TrustCard[];
  summary: Gate1TrustSurfaceSummary;
};
