/**
 * Decision Attribution Layer
 *
 * This layer provides "why" explanations for travel decisions.
 * It bridges the gap between "what happened" (Event Store) and "why it happened" (Attribution).
 *
 * Key separation:
 * - TravelEvent = what happened (event recording)
 * - DecisionAttribution = why it happened (causal explanation)
 */

/**
 * Primary cause type for a decision or event.
 */
export enum DecisionCauseType {
  /** User explicitly made this decision (e.g., selected destination, changed budget) */
  USER_ACTION = 'user_action',

  /** AI system suggested this decision (e.g., recommended route, proposed adjustment) */
  AI_SUGGESTION = 'ai_suggestion',

  /** Constraint forced this decision (e.g., budget limit, time constraint, safety rule) */
  CONSTRAINT = 'constraint',

  /** External factor influenced this decision (e.g., weather, road closure, flight delay) */
  EXTERNAL_FACTOR = 'external_factor',

  /** System policy or governance rule enforced this decision */
  GOVERNANCE = 'governance',

  /** Multiple causes combined (complex decision) */
  MIXED = 'mixed',
}

/**
 * Signal types that influence travel decisions.
 * These are the "factors" that drive decision-making.
 */
export enum DecisionSignal {
  /** Budget-related signals (budget changes, cost constraints, price sensitivity) */
  BUDGET = 'budget',

  /** Weather-related signals (forecast, severe weather, seasonal patterns) */
  WEATHER = 'weather',

  /** Companion-related signals (group size, preferences, compatibility) */
  COMPANION = 'companion',

  /** Time-related signals (duration constraints, scheduling conflicts, timing preferences) */
  TIME = 'time',

  /** Interest-related signals (activity preferences, destination interests, thematic focus) */
  INTEREST = 'interest',

  /** Safety-related signals (security alerts, health risks, travel advisories) */
  SAFETY = 'safety',

  /** Transport-related signals (flight availability, road conditions, transit options) */
  TRANSPORT = 'transport',

  /** Logistics-related signals (accommodation, opening hours, accessibility) */
  LOGISTICS = 'logistics',

  /** Risk-related signals (probability of disruption, uncertainty, volatility) */
  RISK = 'risk',
}

/**
 * Confidence level for attribution analysis.
 */
export enum AttributionConfidence {
  /** High confidence - attribution is well-supported by evidence */
  HIGH = 'high',

  /** Medium confidence - attribution is plausible but not certain */
  MEDIUM = 'medium',

  /** Low confidence - attribution is speculative */
  LOW = 'low',
}

/**
 * Decision attribution record - explains why a decision was made.
 */
export interface DecisionAttribution {
  /** Unique attribution ID */
  attributionId: string;

  /** Associated Trip ID */
  tripId: string;

  /** Associated Event ID (links to TravelEvent) */
  eventId: string;

  /** Primary cause type */
  causeType: DecisionCauseType;

  /** Signals that influenced this decision (ordered by influence strength) */
  signals: DecisionSignal[];

  /** Influence score (0-1) - how strongly this attribution explains the decision */
  influenceScore: number;

  /** Confidence in this attribution */
  confidence: AttributionConfidence;

  /** Detailed explanation (human-readable) */
  explanation: string;

  /** Evidence references (links to EvidenceEnvelope, RiskEvent, etc.) */
  evidenceRefs?: string[];

  /** Timestamp when attribution was computed */
  computedAt: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Attribution analysis result from DecisionAttributionService.
 */
export interface AttributionResult {
  /** Primary attribution */
  attribution: DecisionAttribution;

  /** Alternative attributions (if multiple plausible causes) */
  alternatives?: DecisionAttribution[];

  /** Raw signal scores (for debugging/analysis) */
  signalScores?: Record<DecisionSignal, number>;
}

/**
 * Attribution analysis request.
 */
export interface AttributionRequest {
  /** Trip ID */
  tripId: string;

  /** Event ID to attribute */
  eventId: string;

  /** Event type */
  eventType: string;

  /** Event payload */
  payload: Record<string, unknown>;

  /** Event source */
  source: string;

  /** Context data (trip state, user profile, etc.) */
  context?: AttributionContext;
}

/**
 * Context data for attribution analysis.
 */
export interface AttributionContext {
  /** Current trip state */
  tripState?: {
    status: string;
    destination?: string;
    budget?: number;
    startDate?: string;
    endDate?: string;
    memberCount?: number;
  };

  /** User profile */
  userProfile?: {
    userId: string;
    preferences?: Record<string, unknown>;
    history?: {
      pastDestinations?: string[];
      pastBudgets?: number[];
      decisionPatterns?: Record<string, number>;
    };
  };

  /** Available evidence (from Travel Cognition) */
  evidence?: Array<{
    factType: string;
    entityRef: string;
    confidence: number;
  }>;

  /** Active risks (from Risk Event System) */
  risks?: Array<{
    category: string;
    urgency: number;
    entityRef: string;
  }>;
}

/**
 * Attribution rule configuration (for rule-based attribution).
 */
export interface AttributionRule {
  /** Rule ID */
  ruleId: string;

  /** Rule name */
  name: string;

  /** Event types this rule applies to */
  applicableEventTypes: string[];

  /** Condition to match (simple expression) */
  condition: string;

  /** Cause type to assign if condition matches */
  causeType: DecisionCauseType;

  /** Signals to assign if condition matches */
  signals: DecisionSignal[];

  /** Base influence score */
  influenceScore: number;

  /** Rule priority (higher = checked first) */
  priority: number;
}
