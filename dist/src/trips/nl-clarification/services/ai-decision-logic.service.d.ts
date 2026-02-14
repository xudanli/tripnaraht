import { DestinationClarificationConfigService } from './destination-clarification-config.service';
export declare class AiDecisionLogicService {
    private readonly configService;
    private readonly logger;
    constructor(configService: DestinationClarificationConfigService);
    identifyPersona(destinationCode: string, userAnswers: Record<string, any>): Promise<{
        personaId: string;
        personaName: string;
        personaNameEn?: string;
        confidence: number;
        matchReasons: string[];
    } | null>;
    applySafetyFirstPrinciple(destinationCode: string, personaId: string, activityTypes: string | string[], userAnswers: Record<string, any>): Promise<{
        shouldWarn: boolean;
        warningMessage?: string;
        shouldBlock: boolean;
        blockReason?: string;
        alternatives?: Array<{
            label: string;
            description: string;
            action?: string;
        }>;
    }>;
    getRecommendedRoutes(destinationCode: string, personaId: string, userAnswers: Record<string, any>): Promise<Array<{
        route: string;
        reason: string;
        difficultyMatch: string;
        season?: string;
        prerequisites?: string[];
    }>>;
    applyDecisionMatrix(destinationCode: string, userAnswers: Record<string, any>): Promise<{
        decision: 'GO_FULLY_SUPPORTED' | 'GO_WITH_STRONG_CAUTION' | 'GO_ALTERNATIVE_PLAN' | 'STRONGLY_RECONSIDER' | 'NOT_RECOMMENDED';
        reason: string;
        recommendations: string[];
    }>;
    private getDestinationType;
    private checkAlpsSkillMismatch;
    private matchExperienceLevel;
    private matchRiskTolerance;
    private matchPhysicalFitness;
    private matchBudget;
    private matchSeason;
    private checkPrerequisite;
    private checkRedFlags;
    private checkAllCriticalFields;
    private generateAlternatives;
}
