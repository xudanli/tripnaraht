import { RouteExistenceJudgment, RouteContext, UserProfile } from '../interfaces/route-judgment.interface';
import { RouteDirectionData } from '../interfaces/route-direction.interface';
export declare class RouteJudgmentService {
    private readonly logger;
    judgeRouteExistence(route: RouteDirectionData, context: RouteContext, user: UserProfile): Promise<RouteExistenceJudgment>;
    private assessFeasibility;
    private assessTimeliness;
    private assessMatching;
    private checkAccessibility;
    private checkTimeFeasibility;
    private checkTransportAvailability;
    private checkAdmissionRequirements;
    private checkSeasonFit;
    private checkWeatherFit;
    private checkCrowdFit;
    private checkEventImpact;
    private matchPhysical;
    private matchExperience;
    private matchTime;
    private matchBudget;
    private matchPreference;
    private combineJudgments;
    private generateExistenceExplanation;
    private mapFeasibilityToScore;
    private mapTimelinessToScore;
    private calculateMatchingScore;
    private mapDifficultyToNumber;
}
