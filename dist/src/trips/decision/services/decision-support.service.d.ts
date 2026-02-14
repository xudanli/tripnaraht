import { DecisionOptions, MatchingAnalysis, DecisionInterface } from '../interfaces/decision-support.interface';
import { RouteDirectionData } from '../../../route-directions/interfaces/route-direction.interface';
import { UncertaintyModelingService } from '../../../data-modeling/services/uncertainty-modeling.service';
export declare class DecisionSupportService {
    private readonly uncertaintyModeling?;
    private readonly logger;
    constructor(uncertaintyModeling?: UncertaintyModelingService);
    presentOptions(routes: RouteDirectionData[], userContext: any): Promise<DecisionOptions>;
    generateMatchingAnalysis(route: RouteDirectionData, userContext: any): Promise<MatchingAnalysis>;
    generateDecisionInterface(routes: RouteDirectionData[], userContext: any): Promise<DecisionInterface>;
    private analyzeRoute;
    private extractCharacteristics;
    private analyzeMatching;
    private analyzeRisks;
    private generateComparison;
    private generateUserGuidance;
    private extractUserWants;
    private extractUserConcerns;
    private checkMatch;
    private checkAddress;
    private generateJudgment;
    private generateNextSteps;
    private generateRhythmOptions;
    private generateConditionalSupport;
    private mapDifficultyToNumber;
}
