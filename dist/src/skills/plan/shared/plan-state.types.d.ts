import { WorldModelContext } from '../../../trips/decision/shared/world-model.types';
import { RoutePlanDraft } from '../../../trips/decision/shared/world-model.types';
export interface PlanConstraints {
    time: {
        days: number;
        startDate?: string;
        endDate?: string;
        availableHoursPerDay?: number;
    };
    budget: {
        total?: number;
        currency?: string;
        categories?: {
            transportation?: number;
            accommodation?: number;
            food?: number;
            tickets?: number;
            experiences?: number;
            buffer?: number;
        };
    };
    fitness: {
        level?: 'low' | 'medium' | 'high';
        maxDailyAscentM?: number;
        maxDailyDistanceKm?: number;
        restDayFrequency?: number;
    };
    travelMode?: 'self_drive' | 'public_transit' | 'walking' | 'mixed';
    accommodation?: {
        level?: 'budget' | 'mid' | 'luxury';
        type?: string[];
    };
    mustDo?: string[];
    mustAvoid?: string[];
    companions?: {
        count?: number;
        ages?: number[];
        specialNeeds?: string[];
    };
}
export interface SkeletonPoi {
    placeId: number;
    placeUuid: string;
    nameCN: string;
    nameEN?: string;
    category: 'ATTRACTION' | 'RESTAURANT' | 'HOTEL' | 'SHOPPING' | 'TRANSIT_HUB' | 'HOSPITAL';
    address?: string;
    rating?: number;
    description?: string;
    coordinates?: {
        lat: number;
        lng: number;
    };
    priority?: 'anchor' | 'core' | 'optional';
    metadata?: Record<string, any>;
}
export interface PlanSkeleton {
    id: string;
    name: string;
    dayThemes: Array<{
        day: number;
        theme: string;
        description?: string;
    }>;
    anchors: Array<{
        day: number;
        location: string;
        activity: string;
        priority: 'anchor' | 'core' | 'optional';
    }>;
    transferDays: Array<{
        day: number;
        from: string;
        to: string;
        mode?: string;
    }>;
    pois?: Array<{
        day: number;
        accommodation?: SkeletonPoi;
        restaurants?: Array<{
            meal: 'breakfast' | 'lunch' | 'dinner';
            poi: SkeletonPoi;
        }>;
        attractions?: SkeletonPoi[];
    }>;
    rationale: {
        philosophy: string;
        tradeoffs: string[];
        strengths: string[];
        weaknesses: string[];
    };
}
export interface TransferSegment {
    id: string;
    from: {
        city: string;
        coordinates?: [number, number];
    };
    to: {
        city: string;
        coordinates?: [number, number];
    };
    feasibility: 'feasible' | 'needs_confirmation' | 'infeasible';
    riskFlags: Array<{
        type: 'last_train' | 'tight_connection' | 'night_arrival' | 'weather' | 'other';
        severity: 'low' | 'medium' | 'high';
        description: string;
    }>;
    availableModes?: Array<{
        mode: 'flight' | 'train' | 'bus' | 'self_drive' | 'other';
        time: number;
        cost: number;
        reliability: 'high' | 'medium' | 'low';
        effort: 'low' | 'medium' | 'high';
        recommendation?: string;
    }>;
}
export interface TimeWindow {
    day: number;
    start: string;
    end: string;
    bufferPolicy: 'conservative' | 'standard' | 'aggressive';
}
export interface FatigueScore {
    paceScore: number;
    fatigueDrivers: Array<{
        type: 'early_morning' | 'long_transfer' | 'cumulative_ascent' | 'long_walk' | 'other';
        severity: number;
        description: string;
    }>;
    suggestedRestPoints: Array<{
        day: number;
        reason: string;
    }>;
}
export interface BudgetBreakdown {
    categories: Array<{
        category: 'transportation' | 'accommodation' | 'food' | 'tickets' | 'experiences' | 'buffer';
        min: number;
        max: number;
        estimated: number;
        assumptions: string[];
    }>;
    confidence: 'low' | 'medium' | 'high';
    assumptions: string[];
}
export interface OverrunDetection {
    overrunAmount: number;
    overrunDrivers: Array<{
        category: string;
        amount: number;
        reason: string;
    }>;
}
export interface GateStatus {
    status: 'ALLOW' | 'NEED_CONFIRM' | 'SUGGEST_REPLACE' | 'REJECT';
    reasons: string[];
    missingEvidence: string[];
    guardianResults?: {
        abu: {
            verdict: 'ALLOW' | 'REJECT';
            evidence: string[];
        };
        drdre: {
            verdict: 'ALLOW' | 'ADJUST' | 'REJECT';
            evidence: string[];
        };
        neptune: {
            verdict: 'ALLOW' | 'REPLACE' | 'REJECT';
            evidence: string[];
        };
    };
    consolidatedVerdict?: 'ALLOW' | 'NEED_CONFIRM' | 'REJECT';
    requiredUserConfirmations?: string[];
}
export interface EvidenceEnvelope {
    source_title: string;
    source_url?: string;
    publisher?: string;
    published_at?: string;
    retrieved_at: string;
    excerpt: string;
    relevance: string;
    confidence: 'LOW' | 'MEDIUM' | 'HIGH';
    data_timestamp?: string;
}
export interface ConflictDetection {
    conflicts: Array<{
        type: 'budget' | 'time' | 'pace' | 'feasibility' | 'other';
        severity: 'low' | 'medium' | 'high' | 'critical';
        description: string;
        affectedDays?: number[];
        affectedSegments?: string[];
    }>;
}
export interface DecisionLogRef {
    decision_id: string;
    diff: any;
    evidence_refs: string[];
    rule_version: string;
    timestamp: string;
}
export interface PlanState {
    plan_id: string;
    plan_version: number;
    constraints: PlanConstraints;
    itinerary: RoutePlanDraft;
    mobility: {
        transferSegments: TransferSegment[];
        transferGraph?: any;
    };
    budget: {
        breakdown?: BudgetBreakdown;
        overrun?: OverrunDetection;
    };
    pace: {
        timeWindows?: TimeWindow[];
        fatigueScore?: FatigueScore;
        restPoints?: number[];
    };
    gate: GateStatus;
    evidence_refs: EvidenceEnvelope[];
    decision_log_refs: DecisionLogRef[];
    status: 'DRAFT' | 'PROPOSED' | 'NEED_CONFIRM' | 'LOCKED';
    world?: WorldModelContext;
    metadata?: Record<string, any>;
}
export interface PlanContext {
    destination: {
        country?: string;
        city?: string;
        region?: string;
    };
    days: number;
    travelMode?: 'self_drive' | 'public_transit' | 'walking' | 'mixed';
    mustDo?: string[];
    mustAvoid?: string[];
    constraints?: Partial<PlanConstraints>;
    existingPlanState?: PlanState;
}
export interface PlanSkeletonSet {
    options: PlanSkeleton[];
    recommendation?: {
        optionId: string;
        reason: string;
    };
}
export interface OptionComparison {
    options: Array<{
        optionId: string;
        scores: {
            executability: number;
            cost: number;
            fatigue: number;
            experienceDensity: number;
            risk: number;
            freedom: number;
        };
        summary: string;
    }>;
    recommendation?: {
        optionId: string;
        reason: string;
    };
}
