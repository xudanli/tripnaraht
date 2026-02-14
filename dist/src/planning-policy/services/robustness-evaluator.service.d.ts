import { PlanningPolicy } from '../interfaces/planning-policy.interface';
import { DayScheduleResult } from '../interfaces/scheduler.interface';
import { Poi } from '../interfaces/poi.interface';
import { HpSimulatorService } from './hp-simulator.service';
import { DayOfWeek } from '../utils/time-utils';
export interface Rng {
    next(): number;
}
export declare function mulberry32(seed: number): Rng;
export interface RobustnessConfig {
    samples?: number;
    seed?: number;
    onTimeSlackMin?: number;
    defaultTransitStdRatio?: number;
    defaultQueueStdRatio?: number;
    defaultVisitStdRatio?: number;
    visitStandHpPerMin?: number;
}
export interface PoiLookup {
    getPoiById(poiId: string): Poi | undefined;
}
export declare class MapPoiLookup implements PoiLookup {
    private map;
    constructor(map: Map<string, Poi>);
    getPoiById(id: string): Poi | undefined;
}
export interface PerPoiWindowRisk {
    poiId: string;
    missProb: number;
    reasonTop: Array<{
        reason: string;
        prob: number;
    }>;
}
export interface PerPoiWindowWaitRisk {
    poiId: string;
    waitProb: number;
    waitP50Min: number;
    waitP90Min: number;
}
export interface PerPoiEntrySlackRisk {
    poiId: string;
    slackMeanMin: number;
    slackP10Min: number;
    slackP50Min: number;
    slackP90Min: number;
    slackNegProb: number;
    deadlineTypeTop?: Array<{
        type: 'LAST_ENTRY' | 'WINDOW_END' | 'UNKNOWN';
        prob: number;
    }>;
}
export type OptimizationSuggestion = {
    type: 'SHIFT_EARLIER';
    poiId: string;
    minutes: number;
    reason: string;
} | {
    type: 'REORDER_AVOID_WAIT';
    poiId: string;
    reason: string;
} | {
    type: 'UPGRADE_TRANSIT';
    poiId: string;
    reason: string;
};
export interface WhatIfCandidate {
    id: string;
    title: string;
    description: string;
    schedule: DayScheduleResult;
    metrics: RobustnessMetrics;
    deltaSummary?: {
        missDelta?: number;
        waitDelta?: number;
        completionP10Delta?: number;
        onTimeDelta?: number;
        reason?: string;
    };
    scheduleWarnings?: Array<'TIMELINE_BROKEN' | 'SHIFT_CLAMPED'>;
    impactCost?: {
        timeShiftAbsSumMin: number;
        movedStopCount: number;
        poiOrderChanged: boolean;
        severity: 'LOW' | 'MEDIUM' | 'HIGH';
    };
    confidence?: {
        level: 'LOW' | 'MEDIUM' | 'HIGH';
        reason: string;
    };
    explainTopDrivers?: Array<{
        driver: 'MISS';
        deltaPp: number;
    } | {
        driver: 'WAIT';
        deltaPp: number;
    } | {
        driver: 'COMPLETION_P10';
        deltaPp: number;
    } | {
        driver: 'ONTIME';
        deltaPp: number;
    }>;
    action?: WhatIfAction;
}
export type WhatIfAction = {
    type: 'SHIFT_EARLIER';
    poiId: string;
    minutes: number;
} | {
    type: 'SWAP_NEIGHBOR';
    poiId: string;
    direction: 'PREV' | 'NEXT';
} | {
    type: 'UPGRADE_TRANSIT';
    segmentId: string;
    mode: 'TAXI' | 'EXPRESS';
} | {
    type: 'AUTO_REPLAN';
    trigger: 'MISS' | 'EXCESSIVE_WAIT';
    scope: 'REMAINING_DAY' | 'NEXT_3_STOPS';
};
export interface WhatIfReportMeta {
    baseSamples: number;
    candidateSamples: number;
    confirmSamples: number;
    baseSeed: number;
}
export interface WhatIfEvalContext {
    policy: PlanningPolicy;
    dayEndMin: number;
    dateISO: string;
    dayOfWeek: DayOfWeek;
    poiLookup: PoiLookup;
    budget: WhatIfReportMeta;
}
export interface BuiltCandidate {
    schedule: DayScheduleResult;
    action: WhatIfAction;
    title: string;
    description: string;
}
export interface WhatIfTransformer {
    type: WhatIfAction['type'];
    buildCandidates(args: {
        base: DayScheduleResult;
        context: WhatIfEvalContext;
    }): BuiltCandidate[];
    validate?(c: BuiltCandidate, base: DayScheduleResult): {
        ok: boolean;
        warnings?: string[];
    };
}
export interface WhatIfReport {
    base: WhatIfCandidate;
    candidates: WhatIfCandidate[];
    winnerId?: string;
    riskWarning?: {
        candidateId: string;
        message: string;
    };
    meta: WhatIfReportMeta;
}
export interface RobustnessMetrics {
    samples: number;
    onTimeProb: number;
    expectedOvertimeMin: number;
    overtimeP90Min: number;
    hpEndMean: number;
    hpEndP10: number;
    costMean: number;
    costP90: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    diagnostics: {
        avgTransitDeltaMin: number;
        avgQueueDeltaMin: number;
        avgVisitDeltaMin: number;
        avgWindowWaitDeltaMin: number;
    };
    timeWindowMissProb: number;
    perPoiMissProb: PerPoiWindowRisk[];
    windowWaitProb: number;
    perPoiWaitProb: PerPoiWindowWaitRisk[];
    completedPoiMean: number;
    completedPoiP10: number;
    completionRateMean: number;
    completionRateP10: number;
    perPoiEntrySlack: PerPoiEntrySlackRisk[];
}
export declare class RobustnessEvaluatorService {
    private hpSimulator;
    constructor(hpSimulator: HpSimulatorService);
    evaluateDayRobustness(args: {
        policy: PlanningPolicy;
        schedule: DayScheduleResult;
        dayEndMin: number;
        dateISO: string;
        dayOfWeek: DayOfWeek;
        poiLookup: PoiLookup;
        config?: RobustnessConfig;
    }): RobustnessMetrics;
    private simulateOnce;
    private sampleTransitDuration;
    private sampleQueueMin;
    private sampleVisitMin;
    private mean;
    private quantile;
    private riskLevelFromAll;
    generateOptimizationSuggestions(metrics: RobustnessMetrics, opts?: {
        bufferMin?: number;
        missProbThreshold?: number;
        waitProbThreshold?: number;
    }): OptimizationSuggestion[];
    private shiftScheduleEarlier;
    private swapWithNeighborPoi;
    private getScheduleStructureSignature;
    private getScheduleTimeSignature;
    private isValidCandidate;
    private calculateDeltaSummary;
    private calculateImpactCost;
    private calculateConfidence;
    private calculateExplainTopDrivers;
    getSeedForCandidate(baseSeed: number, candidateId: string): number;
    evaluateWhatIfReport(args: {
        policy: PlanningPolicy;
        schedule: DayScheduleResult;
        dayEndMin: number;
        dateISO: string;
        dayOfWeek: DayOfWeek;
        poiLookup: PoiLookup;
        config?: {
            samples?: number;
            seed?: number;
        };
        suggestions: OptimizationSuggestion[];
        budgetStrategy?: {
            baseSamples?: number;
            candidateSamples?: number;
            confirmSamples?: number;
        };
    }): Promise<WhatIfReport>;
    applyCandidateSchedule(report: WhatIfReport, candidateId: string): DayScheduleResult | null;
    reEvaluateAfterApply(args: {
        policy: PlanningPolicy;
        appliedSchedule: DayScheduleResult;
        dayEndMin: number;
        dateISO: string;
        dayOfWeek: DayOfWeek;
        poiLookup: PoiLookup;
        reEvaluateSamples?: number;
        config?: {
            seed?: number;
        };
    }): Promise<RobustnessMetrics>;
    getRiskWarning(candidate: WhatIfCandidate): string | undefined;
}
