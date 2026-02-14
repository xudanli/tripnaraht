import { ISODatetime, ISODate } from './world-model';
import { ConstraintConflict } from './constraints/constraint-dsl.types';
export type DecisionTrigger = 'initial_generate' | 'user_edit' | 'signal_update' | 'availability_update' | 'time_overrun' | 'budget_overrun' | 'manual_repair';
export interface ConstraintViolation {
    code: string;
    date?: ISODate;
    slotId?: string;
    details?: Record<string, any>;
}
export interface PlanDiffSummary {
    changedSlots: number;
    movedSlots: number;
    removedSlots: number;
    addedSlots: number;
    editDistanceScore: number;
}
export interface DecisionRunLog {
    runId: string;
    at: ISODatetime;
    trigger: DecisionTrigger;
    plannerVersion: string;
    strategyMix: Array<'abu' | 'drdre' | 'neptune'>;
    inputDigest: {
        tripId?: string;
        destination: string;
        startDate: ISODate;
        durationDays: number;
        signalUpdatedAt: ISODatetime;
    };
    violations?: ConstraintViolation[];
    chosenActions: Array<{
        actionType: 'prioritize' | 'drop' | 'swap' | 'reorder' | 'insert_buffer' | 'shorten';
        reasonCodes: string[];
        payload: Record<string, any>;
    }>;
    predictedImpact?: {
        costChange?: number;
        activeMinutesChange?: number;
        travelMinutesChange?: number;
        robustnessChange?: number;
    };
    diff?: PlanDiffSummary;
    planBeforeRef?: string;
    planAfterRef?: string;
    explanation?: string;
    strategyLogs?: Array<{
        persona: 'ABU' | 'DR_DRE' | 'NEPTUNE';
        action: 'ALLOW' | 'REJECT' | 'ADJUST' | 'REPLACE';
        explanation: string;
        reasonCodes: string[];
        timestamp: string;
    }>;
    routeDirectionExplanation?: string;
    routeDirection?: {
        selected: {
            id: number;
            uuid?: string;
            name?: string;
            nameCN?: string;
        };
        scoreBreakdown?: {
            tagMatch?: {
                score: number;
                matchedTags?: string[];
            };
            seasonMatch?: {
                score: number;
                month?: number;
                bestMonths?: number[];
            };
            paceMatch?: {
                score: number;
                userPace?: string;
                routePace?: string;
            };
            riskMatch?: {
                score: number;
                userRiskTolerance?: string;
                routeRiskLevel?: string;
            };
            totalScore?: number;
        };
        constraints?: Record<string, any>;
        matchedSignals?: Record<string, any>;
    };
    evidenceChain?: {
        planEvidence?: {
            whyThisRoute?: string[];
            whyThisItinerary?: string[];
            segmentationEvidence?: {
                totalDistance: number;
                totalAscent: number;
                steepSections: number;
                energyBreakpoints: number;
                mandatoryRestPoints: number;
            };
            riskEvidence?: {
                consecutiveHighAltitudeDays: number;
                consecutiveAscent: number;
                steepConcentratedSections: number;
                totalRiskScore: number;
            };
        };
        dailyEvidences?: Array<{
            date: string;
            day: number;
            slotEvidences?: Array<{
                slotId: string;
                activityName: string;
                evidence?: Array<{
                    type: string;
                    title: string;
                    description: string;
                    data?: Record<string, any>;
                    severity?: string;
                    impactsDecision: boolean;
                    decisionImpact?: string;
                }>;
                whySelected?: string[];
                whyThisTime?: string[];
                whyThisLocation?: string[];
            }>;
            whyThisDay?: string[];
            terrainEvidence?: {
                maxElevation: number;
                totalAscent: number;
                steepSections?: number;
                mandatoryRestPoints?: number;
                energyBreakpoints?: number;
            };
            energyEvidence?: {
                totalEnergyCost: number;
                maxEnergyBudget: number;
                energyRatio: number;
                exceeded?: boolean;
            };
            riskEvidence?: {
                riskScore: number;
                riskFlags?: Array<{
                    type: string;
                    severity: string;
                    message: string;
                }>;
            };
        }>;
    };
    demEvidence?: {
        segmentEvidences?: Array<{
            segmentId: string;
            violation: 'HARD' | 'SOFT' | 'NONE';
            explanation: string;
        }>;
        hasHardViolation?: boolean;
        hasSoftViolation?: boolean;
        rollingFatigue?: {
            detected: boolean;
            startDay?: number;
            endDay?: number;
            suggestedAction?: string;
            explanation?: string;
        };
        canProceed?: boolean;
    };
    dryRunResult?: {
        willFail?: boolean;
        failureDay?: number;
        failureReason?: string;
        recommendations?: string[];
    };
    conflicts?: ConstraintConflict[];
}
