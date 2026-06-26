export type DataReliabilityFactType =
  | 'WEATHER'
  | 'ROAD_STATUS'
  | 'OPENING_HOURS'
  | 'SAFETY_ALERT'
  | 'TRANSPORT_TIME'
  | 'FLIGHT_STATUS'
  | 'POI_EXISTENCE';

export type DataReliabilitySourceType = 'OFFICIAL' | 'COMMERCIAL' | 'COMMUNITY' | 'MODEL' | 'USER' | 'UNKNOWN';

export interface DataReliabilityEntityRef {
  type: 'POI' | 'DAY' | 'SEGMENT' | 'BUDGET' | 'DESTINATION' | 'OTHER';
  id?: string;
}

export interface DataReliabilityEvidenceEnvelope<T = unknown> {
  id: string;
  factType: DataReliabilityFactType;
  entityRef: DataReliabilityEntityRef;
  value: T;
  source: {
    provider: string;
    sourceType: DataReliabilitySourceType;
    url?: string;
    rawPayloadHash?: string;
  };
  observedAt: string;
  validUntil?: string;
  confidence: number;
  freshnessTtlSec: number;
  reliability?: {
    authorityScore?: number;
    recencyScore?: number;
    consistencyScore?: number;
    historicalScore?: number;
  };
}

export interface DataReliabilityFinding {
  kind: 'STALE' | 'LOW_CONFIDENCE' | 'MODEL_ONLY' | 'CONFLICT';
  factType: DataReliabilityFactType;
  entityRef: DataReliabilityEntityRef;
  evidenceIds: string[];
  message: string;
  confidenceImpact: number;
}

export interface DataReliabilityGateResult {
  evidence: DataReliabilityEvidenceEnvelope[];
  findings: DataReliabilityFinding[];
  confidenceDelta: number;
  disclosure: string;
}
