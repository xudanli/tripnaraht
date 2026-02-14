import { OrchestrationMode } from './resolve-orchestration-mode.util';
import { RiskLevel } from './orchestration-signals.util';
export interface OrchestrationMetrics {
    recordMode(mode: OrchestrationMode, requestId: string): void;
    recordRisk(risk: RiskLevel, requestId: string): void;
    recordConsent(triggered: boolean, requestId: string, reason?: string): void;
    recordRecommendationVsExecution(recommendedSM: boolean, actualMode: OrchestrationMode, requestId: string): void;
    getMetricsSummary(): {
        modeDistribution: Record<OrchestrationMode, number>;
        riskDistribution: Record<RiskLevel, number>;
        consentTriggerRate: number;
        smRecommendationAccuracy: {
            recommended: number;
            executed: number;
            accuracy: number;
        };
    };
}
export declare class InMemoryOrchestrationMetrics implements OrchestrationMetrics {
    private readonly modeCounts;
    private readonly riskCounts;
    private readonly consentTriggers;
    private readonly recommendationVsExecution;
    recordMode(mode: OrchestrationMode, requestId: string): void;
    recordRisk(risk: RiskLevel, requestId: string): void;
    recordConsent(triggered: boolean, requestId: string, reason?: string): void;
    recordRecommendationVsExecution(recommendedSM: boolean, actualMode: OrchestrationMode, requestId: string): void;
    getMetricsSummary(): {
        modeDistribution: Record<OrchestrationMode, number>;
        riskDistribution: Record<RiskLevel, number>;
        consentTriggerRate: number;
        smRecommendationAccuracy: {
            recommended: number;
            executed: number;
            accuracy: number;
        };
    };
}
