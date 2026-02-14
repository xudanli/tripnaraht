import { RouteDirectionsService } from '../route-directions.service';
import { RouteDirectionObservabilityService } from './route-direction-observability.service';
import { RouteDirectionCacheService } from './route-direction-cache.service';
import { RouteConstraints, RiskProfile } from '../interfaces/route-direction.interface';
import { ScoreBreakdown, MatchedSignals } from '../interfaces/route-direction-explanation.interface';
import { DecisionParamsInjectorService } from '../../agent/memory/services/decision-params-injector.service';
export interface UserIntent {
    preferences?: string[];
    pace?: 'relaxed' | 'moderate' | 'intense';
    riskTolerance?: 'low' | 'medium' | 'high';
    durationDays?: number;
    [key: string]: any;
}
export interface RouteDirectionRecommendation {
    routeDirection: any;
    score: number;
    reasons: string[];
    constraints?: RouteConstraints;
    riskProfile?: RiskProfile;
    signaturePois?: any;
    scoreBreakdown?: ScoreBreakdown;
    matchedSignals?: MatchedSignals;
}
export declare class RouteDirectionSelectorService {
    private readonly routeDirectionsService;
    private readonly observabilityService?;
    private readonly cacheService?;
    private readonly decisionParamsInjector?;
    private readonly logger;
    constructor(routeDirectionsService: RouteDirectionsService, observabilityService?: RouteDirectionObservabilityService, cacheService?: RouteDirectionCacheService, decisionParamsInjector?: DecisionParamsInjectorService);
    pickRouteDirections(userIntent: UserIntent, countryCode: string, month?: number, requestId?: string): Promise<RouteDirectionRecommendation[]>;
    private scoreRouteDirectionWithBreakdown;
    private extractMatchedSignals;
    private inferRouteRisk;
    private getPrimaryRejectionReason;
    private createEmptyBreakdown;
    private createEmptyMatchedSignals;
    private scoreRouteDirection;
    private calculateTagOverlap;
    private matchPace;
    private matchRisk;
    private generateReasons;
    private generateWhyNotOthers;
}
