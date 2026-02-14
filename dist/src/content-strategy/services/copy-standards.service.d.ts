import { RecommendationCopy, RiskCopy, RejectionCopy, DataPresentationCopy, UserContext, TechnicalRisk, RejectionReason } from '../interfaces/copy-standards.interface';
import { RouteDirectionData } from '../../route-directions/interfaces/route-direction.interface';
export declare class CopyStandardsService {
    private readonly logger;
    generateMatchingBasedRecommendation(route: RouteDirectionData, matchingScore: number, userContext: UserContext): RecommendationCopy;
    generateRiskCopy(risk: TechnicalRisk): RiskCopy;
    generateHonestRejection(route: RouteDirectionData, reason: RejectionReason, userContext: UserContext): RejectionCopy;
    generateDataPresentationCopy(title: string, value: string | number, context: {
        whatItMeans?: string;
        source?: string;
        confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
        conclusion?: string;
        reason?: string;
        evidence?: string;
    }): DataPresentationCopy;
    private generateReasons;
    private generateConsiderations;
    private generateAlternatives;
    private extractMatchingPoints;
    private identifyPotentialChallenges;
    private identifyPreparationNeeds;
    private translateRiskType;
    private explainRiskReason;
    private generatePreparationGuide;
    private generateEmpowermentMessage;
    private generatePossibilities;
    private inferMeaning;
}
