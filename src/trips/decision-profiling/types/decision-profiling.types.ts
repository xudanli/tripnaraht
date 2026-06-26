/** PDI-4 — 轻量决策风格画像与摩擦预警 */

export const DECISION_STYLE_TYPES = [
  'RATIONAL_EXPLORER',
  'EXPERIENCE_SEEKER',
  'HARMONY_COORDINATOR',
  'SPONTANEOUS_ADVENTURER',
  'PRAGMATIC_PLANNER',
  'FLEXIBLE_OPTIMIZER',
] as const;

export type DecisionStyleType = (typeof DECISION_STYLE_TYPES)[number];

export const FRICTION_DOMAINS = [
  'accommodation',
  'dining',
  'activities',
  'transportation',
  'pace',
  'budget',
  'planning_style',
  'group_decision',
] as const;

export type FrictionDomain = (typeof FRICTION_DOMAINS)[number];

export type FrictionLevel = 'green' | 'yellow' | 'red';

export type SplitMechanismMode =
  | 'split_aa'
  | 'rotating_treat'
  | 'proportional'
  | 'hybrid';

export type CompatibilityBand = 'high' | 'needs_negotiation' | 'high_risk';

export interface QuizOption {
  id: string;
  label: string;
  /** Per-style or per-dimension score deltas */
  scores: Record<string, number>;
}

export interface QuizQuestion {
  id: string;
  section: 'travel_style' | 'money_dna';
  prompt: string;
  context?: string;
  options: QuizOption[];
}

export type TravelStyleCardSource =
  | 'quiz'
  | 'quiz_edited'
  | 'reused'
  | 'reused_edited'
  | 'inferred';

export type MoneyDnaCardSource =
  | 'quiz'
  | 'quiz_edited'
  | 'reused'
  | 'reused_edited'
  | 'inferred';

export type ProfilingSectionSource = 'quiz' | 'reused' | 'inferred' | null;

export type ReuseBlockedReason =
  | 'no_profile'
  | 'quiz_version_mismatch'
  | 'profile_stale'
  | 'inferred_only';

export interface TravelStyleCard {
  userId: string;
  styleType: DecisionStyleType;
  styleLabel: string;
  coreDrivers: string[];
  teamRole: string;
  compatibilityHints: string[];
  userNote?: string;
  confidence: number;
  completedAt: string;
  source: TravelStyleCardSource;
}

export interface TravelStyleCardTeamView {
  userId: string;
  displayName: string;
  styleLabel: string;
  compatibilityHints: string[];
}

export interface MoneyDnaQuizVector {
  experienceTendency: number;
  qualityTendency: number;
  timeValueTendency: number;
  socialScarcityTendency: number;
}

export interface MoneyDnaCard {
  userId: string;
  vector: MoneyDnaQuizVector;
  budgetRangeMin?: number;
  budgetRangeMax?: number;
  consumptionPace: 'planned' | 'spontaneous' | 'balanced';
  userNote?: string;
  confidence: number;
  completedAt: string;
  source?: MoneyDnaCardSource;
}

export interface MoneyDnaCardTeamView {
  userId: string;
  displayName: string;
  /** 0–100 cosine similarity vs viewer */
  styleSimilarityPct: number;
}

export interface FrictionPairCell {
  domain: FrictionDomain;
  level: FrictionLevel;
  score: number;
  reason?: string;
}

export interface FrictionMatrixEntry {
  memberAId: string;
  memberBId: string;
  memberAName: string;
  memberBName: string;
  cells: FrictionPairCell[];
  overallLevel: FrictionLevel;
}

export interface FrictionAlert {
  id: string;
  domain: FrictionDomain;
  domainLabel: string;
  level: 'red';
  memberAId: string;
  memberBId: string;
  memberAName: string;
  memberBName: string;
  summary: string;
  recommendedStrategy: string;
}

export interface ConsumptionCompatibility {
  budgetOverlapPct: number;
  styleSimilarityPct: number;
  paceSyncPct: number;
  overallScore: number;
  band: CompatibilityBand;
  bandLabel: string;
}

export interface FrictionRadarSnapshot {
  tripId: string;
  completionRate: number;
  completedCount: number;
  memberCount: number;
  frictionMatrix: FrictionMatrixEntry[];
  highRiskAlerts: FrictionAlert[];
  compatibility: ConsumptionCompatibility;
  computedAt: string;
}

export interface SplitSimulationMember {
  userId: string;
  displayName: string;
  estimatedSpend: number;
}

export interface SplitMechanismOption {
  mode: SplitMechanismMode;
  label: string;
  description: string;
  fitScore: number;
  rationale: string;
  hybridBreakdown?: Record<string, SplitMechanismMode>;
}

export interface SplitSimulationResult {
  totalEstimate: number;
  currency: string;
  byMode: Record<
    SplitMechanismMode,
    { members: SplitSimulationMember[]; note: string }
  >;
}

export interface SplitConsensusState {
  tripId: string;
  recommendedMode: SplitMechanismMode;
  options: SplitMechanismOption[];
  simulation: SplitSimulationResult | null;
  selectedMode: SplitMechanismMode | null;
  confirmations: Array<{ userId: string; displayName: string; confirmedAt: string | null }>;
  lockedAt: string | null;
  lockedMode: SplitMechanismMode | null;
  allConfirmed: boolean;
}

export interface ReusePreview {
  travelStyleLabel: string;
  moneyDnaSummary: string;
  confidence: { travelStyle: number; moneyDna: number };
}

export interface ReuseEligibility {
  eligible: boolean;
  quizVersion: string;
  profileQuizVersion: string | null;
  lastCompletedAt: string | null;
  lastCompletedTripLabel: string | null;
  preview: ReusePreview | null;
  blockedReason: ReuseBlockedReason | null;
}

export interface OnboardingStatus {
  tripId: string;
  userId: string;
  travelStyleCompleted: boolean;
  moneyDnaCompleted: boolean;
  quizCompleted: boolean;
  teamCompletionRate: number;
  reuse?: ReuseEligibility;
}

export interface ReuseProfileResult {
  onboarding: OnboardingStatus;
  travelStyle: TravelStyleCard;
  moneyDna: MoneyDnaCard;
}

export interface SubmitQuizAnswer {
  questionId: string;
  optionId: string;
}

export interface SubmitQuizPayload {
  answers: SubmitQuizAnswer[];
  userNote?: string;
}
