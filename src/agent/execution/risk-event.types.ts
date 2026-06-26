export type TravelRiskCategory =
  | 'WEATHER_NATURAL'
  | 'TRANSPORT_DISRUPTION'
  | 'SAFETY_SECURITY'
  | 'HEALTH'
  | 'ROAD_ACCESS'
  | 'OPENING_CLOSURE';

export type TravelRiskUrgency = 1 | 2 | 3 | 4 | 5;

export type TravelRiskSourceType = 'OFFICIAL' | 'COMMERCIAL' | 'COMMUNITY' | 'MODEL' | 'UNKNOWN';

export interface TravelRiskEntityRef {
  type: 'DESTINATION' | 'DAY' | 'SEGMENT' | 'POI' | 'FLIGHT' | 'ROAD' | 'OTHER';
  id?: string;
}

export interface TravelRiskEvent {
  id: string;
  category: TravelRiskCategory;
  urgency: TravelRiskUrgency;
  entityRef: TravelRiskEntityRef;
  timeWindow?: {
    startsAt?: string;
    endsAt?: string;
  };
  message: string;
  source: {
    provider: string;
    sourceType: TravelRiskSourceType;
  };
  observedAt: string;
  validUntil?: string;
  confidence: number;
  suggestedAction?: 'RECHECK' | 'DELAY' | 'REORDER' | 'REPLACE' | 'ADD_BUFFER' | 'ASK_USER' | 'AVOID';
}

export interface RiskImpactEdge {
  from: string;
  to: string;
  dependency:
    | 'TIME_DEPENDENCY'
    | 'LOCATION_DEPENDENCY'
    | 'WEATHER_DEPENDENCY'
    | 'ACCESS_DEPENDENCY'
    | 'HUMAN_FATIGUE_DEPENDENCY';
  bufferMinutes?: number;
}

export interface RiskImpactAssessment {
  eventId: string;
  affectedItems: string[];
  affectedDays: string[];
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  recommendedActions: Array<'ADD_BUFFER' | 'REORDER' | 'REPLACE' | 'ASK_USER' | 'DELAY'>;
  summaryZh: string;
  /** 事件原始置信度 */
  rootConfidence: number;
  /** 传播最大深度 */
  propagationDepth: number;
  /** 衰减后有效置信度（取受影响项最低值） */
  cascadeConfidence: number;
  /** 各行程项的衰减后置信度 */
  affectedItemConfidences?: Record<string, number>;
}

export interface RiskGateResult {
  events: TravelRiskEvent[];
  issueCount: number;
  confidenceDelta: number;
  audit: {
    riskAssessmentCompleted: boolean;
    criticalRisks: string[];
    evidenceIds: string[];
    userDisclosure: string;
    recommendedActions: string[];
    unresolvedRisks: string[];
    impactAssessments?: RiskImpactAssessment[];
  };
}
