import { RestTimeRecommendation, RestTimeModelConfig, UserFatigueState } from '../interfaces/executability-enhancement.interface';
export declare class EnhancedRestTimeService {
    private readonly logger;
    private readonly defaultConfig;
    recommendRestTime(fatigueState: UserFatigueState, config?: Partial<RestTimeModelConfig>): Promise<RestTimeRecommendation>;
    private determineFatigueLevel;
    private determineRestType;
    private calculateRestTime;
    private calculateConfidence;
    private generateRecommendations;
}
