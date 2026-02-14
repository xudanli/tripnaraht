import { DecisionRunLog } from '../decision-log';
import { PlanMetrics } from '../evaluation/evaluation.service';
export interface MonitoringMetrics {
    performance: {
        avgGenerationTime: number;
        avgRepairTime: number;
        p95GenerationTime: number;
        p95RepairTime: number;
    };
    quality: {
        avgExecutabilityRate: number;
        avgStabilityScore: number;
        violationRate: number;
    };
    usage: {
        totalPlansGenerated: number;
        totalRepairs: number;
        activeUsers: number;
    };
}
export interface Alert {
    level: 'info' | 'warning' | 'error' | 'critical';
    message: string;
    timestamp: string;
    details?: Record<string, any>;
}
export declare class MonitoringService {
    private readonly logger;
    private readonly metrics;
    private readonly generationTimes;
    private readonly repairTimes;
    private readonly executabilityRates;
    private readonly stabilityScores;
    private readonly alerts;
    recordPlanGeneration(log: DecisionRunLog, generationTime: number, metrics?: PlanMetrics): void;
    recordPlanRepair(log: DecisionRunLog, repairTime: number, metrics?: PlanMetrics): void;
    getMetrics(): MonitoringMetrics;
    getAlerts(level?: Alert['level']): Alert[];
    private updatePerformanceMetrics;
    private updateQualityMetrics;
    private checkAlerts;
    private addAlert;
    reset(): void;
}
