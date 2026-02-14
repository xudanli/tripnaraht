import { RewardFunctionConfig, RewardCalculationResult, RewardWeights, GatedRewardConfig, GatedRewardMetrics, GatedRewardResult, TripNARAApprovalSignals } from '../interfaces/product.interface';
export declare class RewardDefinitionService {
    private readonly logger;
    private readonly gatedConfig;
    private readonly defaultConfig;
    calculateGatedReward(metrics: GatedRewardMetrics, config?: GatedRewardConfig): GatedRewardResult;
    private createGateFailureResult;
    calculateTripNARAReward(signals: TripNARAApprovalSignals, metrics: GatedRewardMetrics): GatedRewardResult;
    private calculateExperienceScore;
    private calculatePreferenceBonus;
    getGatedConfig(): GatedRewardConfig;
    updateGateThresholds(gates: Partial<{
        safety: number;
        compliance: number;
        feasibility: number;
    }>): GatedRewardConfig;
    updateExperienceWeights(weights: Partial<{
        satisfaction: number;
        diversity: number;
        cost_efficiency: number;
        novelty: number;
    }>): GatedRewardConfig;
    calculateReward(metrics: {
        success_rate: number;
        satisfaction: number;
        cost: number;
        compliance_rate: number;
    }, config?: RewardFunctionConfig): RewardCalculationResult;
    private normalize;
    updateWeights(weights: Partial<RewardWeights>): RewardFunctionConfig;
    getDefaultConfig(): RewardFunctionConfig;
}
