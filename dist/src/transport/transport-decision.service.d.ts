import { TransportOption, UserContext, TransportRecommendation } from './interfaces/transport.interface';
export declare class TransportDecisionService {
    rankOptions(options: TransportOption[], context: UserContext): TransportRecommendation;
    private calculatePainScore;
    private getTimeValue;
    private generateRecommendationReason;
    private generateWarnings;
    private generateOverallReason;
    private generateSpecialAdvice;
}
