import { RouteDirectionRecommendation } from '../services/route-direction-selector.service';
import { TripPlan } from '../../trips/decision/plan-model';
export interface ComplianceChecklistItem {
    id: string;
    type: 'permit' | 'guide' | 'document' | 'restriction';
    title: string;
    description: string;
    required: boolean;
    recommendedDaysAhead: number;
    urgency: 'low' | 'medium' | 'high' | 'critical';
    riskReminder?: string;
    applicationInfo?: {
        name: string;
        link?: string;
        cost?: number;
        provider?: string;
    };
    alternativeOptions?: string[];
    regions?: string[];
    poiTypes?: string[];
}
export interface ComplianceChecklist {
    items: ComplianceChecklistItem[];
    summary: {
        totalItems: number;
        requiredItems: number;
        criticalItems: number;
        estimatedDaysAhead: number;
    };
    userActionRequired: {
        hard: ComplianceChecklistItem[];
        soft: ComplianceChecklistItem[];
    };
    downgradeOptions?: {
        reason: string;
        alternativeRouteDirections?: string[];
    };
}
export declare class CompliancePluginService {
    private readonly logger;
    generateChecklist(routeDirection: RouteDirectionRecommendation, itineraryDraft?: TripPlan, regions?: string[], poiTypes?: string[], userComplianceStatus?: {
        permitAccepted?: boolean;
        guideAccepted?: boolean;
        permitRejected?: boolean;
        guideRejected?: boolean;
    }): ComplianceChecklist;
    private createPermitItem;
    private createGuideItem;
    private createRestrictionItem;
    private checkItineraryCompliance;
    private generateDowngradeOptions;
    private getCountryPermitConfig;
    private getCountryGuideConfig;
    private getRecommendedDaysAhead;
    private getAlternativeRoutes;
}
