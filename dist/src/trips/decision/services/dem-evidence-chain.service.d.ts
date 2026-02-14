import { TripPlan } from '../plan-model';
import { RouteSegmentation } from './dem-route-segmentation.service';
import { PlanRiskScore } from './dem-risk-scoring.service';
import { DailyEnergyBudget } from './dem-daily-energy.service';
export interface EvidenceItem {
    type: 'TERRAIN' | 'ENERGY' | 'RISK' | 'SEGMENTATION' | 'CONSTRAINT' | 'PACE';
    title: string;
    description: string;
    data?: {
        elevation?: number;
        slope?: number;
        distance?: number;
        energyCost?: number;
        riskScore?: number;
        [key: string]: any;
    };
    severity?: 'LOW' | 'MEDIUM' | 'HIGH';
    impactsDecision: boolean;
    decisionImpact?: 'SELECTION' | 'ORDERING' | 'TIMING' | 'REST';
}
export interface SlotEvidence {
    slotId: string;
    activityName: string;
    evidence: EvidenceItem[];
    whySelected: string[];
    whyThisTime?: string[];
    whyThisLocation?: string[];
}
export interface DayEvidence {
    date: string;
    day: number;
    slotEvidences: SlotEvidence[];
    whyThisDay: string[];
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
        riskFlags: Array<{
            type: string;
            severity: string;
            message: string;
        }>;
    };
}
export interface RouteEvidenceChain {
    planEvidence: {
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
    dailyEvidences: DayEvidence[];
}
export declare class DEMEvidenceChainService {
    private readonly logger;
    generateEvidenceChain(plan: TripPlan, routeSegmentation?: RouteSegmentation, planRiskScore?: PlanRiskScore, dailyEnergyBudgets?: Array<{
        day: number;
        budget: DailyEnergyBudget;
    }>, selectedRouteDirection?: any): RouteEvidenceChain;
    private generatePlanEvidence;
    private generateDayEvidence;
    private generateSlotEvidence;
    private getEffortLevelText;
}
