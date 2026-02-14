import { PhysicalRealityModel } from '../models/physical-reality.model';
import { HumanCapabilityModel } from '../models/human-capability.model';
import { RouteDirectionData } from '../../../route-directions/interfaces/route-direction.interface';
import { RoutePhilosophy } from '../models/route-philosophy.model';
export interface DemDecisionEvidence {
    segmentId: string;
    elevationProfile: number[];
    cumulativeAscent: number;
    maxSlopePct: number;
    rollingAscent3Days: number;
    fatigueIndex: number;
    violation: 'HARD' | 'SOFT' | 'NONE';
    explanation: string;
    metadata?: {
        consecutiveHighAltitudeDays?: number;
        avgSlopePct?: number;
        distanceM?: number;
        elevationRange?: {
            min: number;
            max: number;
        };
        [key: string]: any;
    };
}
export interface WeatherEvidence {
    segmentId: string;
    windSpeedMs: number;
    visibilityM: number;
    precipitationMm: number;
    violation: 'HARD' | 'SOFT' | 'NONE';
}
export interface ComplianceEvidence {
    requiresPermit: boolean;
    requiresGuide: boolean;
    valid: boolean;
    violation: 'HARD' | 'SOFT' | 'NONE';
}
export interface DecisionParams {
    maxDailyAscentM: number;
    rollingAscent3DaysM: number;
    maxSlopePct: number;
    weatherRiskWeight: number;
    bufferDayBias: 'LOW' | 'MEDIUM' | 'HIGH';
    riskTolerance: 'LOW' | 'MEDIUM' | 'HIGH';
}
export interface RouteDirectionWithPhilosophy extends RouteDirectionData {
    philosophy?: RoutePhilosophy | string;
}
export interface WorldModelContext {
    physical: PhysicalRealityModel;
    human: HumanCapabilityModel;
    routeDirection: RouteDirectionWithPhilosophy;
    complianceEvidence?: ComplianceEvidence[];
}
export interface LegacyWorldModelContext {
    countryCode: string;
    month: number;
    decisionParams: DecisionParams;
    demEvidence: DemDecisionEvidence[];
    weatherEvidence?: WeatherEvidence[];
    complianceEvidence?: ComplianceEvidence[];
}
export interface RouteSegment {
    segmentId: string;
    dayIndex: number;
    distanceKm: number;
    ascentM: number;
    slopePct: number;
    metadata?: Record<string, any>;
    graphRelations?: {
        fromPlaceId?: string;
        toPlaceId?: string;
        graphNodeId?: string;
        relationType?: 'CONNECTS_TO' | 'BELONGS_TO' | 'HAS_SEGMENT';
    };
}
export interface RoutePlanDraft {
    tripId: string;
    routeDirectionId: string;
    segments: RouteSegment[];
}
