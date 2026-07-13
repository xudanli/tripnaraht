/**
 * Travel Outcome Model
 *
 * Defines the structure for evaluating trip results.
 * This answers "how good was the trip?" vs Attribution's "why did it happen?".
 */

/**
 * Overall success assessment of a trip.
 */
export enum TripSuccessLevel {
  /** Trip completed successfully with minimal issues */
  EXCELLENT = 'excellent',

  /** Trip completed successfully with minor issues */
  GOOD = 'good',

  /** Trip completed but with significant issues */
  ACCEPTABLE = 'acceptable',

  /** Trip had major problems or was incomplete */
  POOR = 'poor',

  /** Trip failed or was cancelled */
  FAILED = 'failed',
}

/**
 * Budget performance category.
 */
export enum BudgetPerformance {
  /** Under budget (spent less than planned) */
  UNDER_BUDGET = 'under_budget',

  /** Within acceptable variance (±10%) */
  ON_BUDGET = 'on_budget',

  /** Slightly over budget (10-20% over) */
  SLIGHTLY_OVER = 'slightly_over',

  /** Significantly over budget (20%+ over) */
  SIGNIFICANTLY_OVER = 'significantly_over',
}

/**
 * Completion rate category.
 */
export enum CompletionRate {
  /** All planned activities completed */
  FULL = 'full',

  /** Most activities completed (80-99%) */
  HIGH = 'high',

  /** Moderate completion (50-79%) */
  MODERATE = 'moderate',

  /** Low completion (<50%) */
  LOW = 'low',
}

/**
 * Travel outcome - comprehensive result evaluation.
 */
export interface TravelOutcome {
  /** Unique outcome ID */
  outcomeId: string;

  /** Associated Trip ID */
  tripId: string;

  /** Overall success level */
  success: TripSuccessLevel;

  /** User satisfaction score (0-10) */
  satisfaction: number;

  /** Budget performance */
  budgetPerformance: BudgetPerformance;

  /** Planned budget */
  plannedBudget: number;

  /** Actual spent */
  actualSpent: number;

  /** Budget deviation percentage (positive = over budget) */
  budgetDeviation: number;

  /** Completion rate */
  completionRate: CompletionRate;

  /** Planned activities count */
  plannedActivities: number;

  /** Completed activities count */
  completedActivities: number;

  /** Completion percentage (0-100) */
  completionPercentage: number;

  /** Overall outcome score (0-1) */
  overallScore: number;

  /** Outcome computed timestamp */
  computedAt: string;

  /** Additional metrics */
  metrics?: OutcomeMetrics;

  /** Factors that influenced the outcome */
  factors?: OutcomeFactor[];

  /** Recommendations for improvement */
  recommendations?: string[];
}

/**
 * Detailed outcome metrics.
 */
export interface OutcomeMetrics {
  /** On-time performance (0-1) */
  onTimePerformance: number;

  /** Safety incidents count */
  safetyIncidents: number;

  /** Weather disruptions count */
  weatherDisruptions: number;

  /** Transport issues count */
  transportIssues: number;

  /** Accommodation issues count */
  accommodationIssues: number;

  /** Activity cancellations count */
  activityCancellations: number;

  /** Plan changes count */
  planChanges: number;

  /** User engagement score (0-1) */
  userEngagement: number;

  /** Stress level (0-1, higher = more stressful) */
  stressLevel: number;
}

/**
 * Factor that influenced the outcome.
 */
export interface OutcomeFactor {
  /** Factor type */
  type: OutcomeFactorType;

  /** Impact level (0-1) */
  impact: number;

  /** Description */
  description: string;

  /** Positive or negative impact */
  polarity: 'positive' | 'negative' | 'neutral';
}

/**
 * Types of factors that influence outcomes.
 */
export enum OutcomeFactorType {
  BUDGET = 'budget',
  WEATHER = 'weather',
  TRANSPORT = 'transport',
  ACCOMMODATION = 'accommodation',
  HEALTH = 'health',
  SAFETY = 'safety',
  TIME = 'time',
  PLANNING = 'planning',
  EXECUTION = 'execution',
}

/**
 * Outcome calculation request.
 */
export interface OutcomeCalculationRequest {
  /** Trip ID */
  tripId: string;

  /** Trip data */
  tripData: TripDataForOutcome;

  /** Event data (from Event Store) */
  events?: TravelEventData[];

  /** User feedback (if available) */
  userFeedback?: UserFeedback;
}

/**
 * Trip data needed for outcome calculation.
 */
export interface TripDataForOutcome {
  /** Trip status */
  status: string;

  /** Destination */
  destination: string;

  /** Start date */
  startDate: Date;

  /** End date */
  endDate: Date;

  /** Planned budget */
  plannedBudget: number;

  /** Actual spent (if known) */
  actualSpent?: number;

  /** Member count */
  memberCount: number;

  /** Planned activities count */
  plannedActivities?: number;

  /** Completed activities count */
  completedActivities?: number;
}

/**
 * Travel event data for outcome calculation.
 */
export interface TravelEventData {
  /** Event type */
  eventType: string;

  /** Event timestamp */
  timestamp: Date;

  /** Event payload */
  payload: Record<string, unknown>;

  /** Event attribution (if available) */
  attribution?: {
    causeType: string;
    signals: string[];
  };
}

/**
 * User feedback data.
 */
export interface UserFeedback {
  /** Overall satisfaction (0-10) */
  overallSatisfaction?: number;

  /** Budget satisfaction (0-10) */
  budgetSatisfaction?: number;

  /** Activity satisfaction (0-10) */
  activitySatisfaction?: number;

  /** Text feedback */
  textFeedback?: string;

  /** Would recommend (boolean) */
  wouldRecommend?: boolean;

  /** Would repeat (boolean) */
  wouldRepeat?: boolean;
}

/**
 * Outcome calculation result.
 */
export interface OutcomeCalculationResult {
  /** Calculated outcome */
  outcome: TravelOutcome;

  /** Confidence in the calculation (0-1) */
  confidence: number;

  /** Data quality score (0-1) */
  dataQuality: number;

  /** Missing data fields */
  missingData: string[];
}
