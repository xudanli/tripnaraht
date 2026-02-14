import { DecisionLogStorageService } from '../services/decision-log-storage.service';
import { DecisionLogEntry, DecisionSource, DecisionStage } from '../shared/decision-result.types';
export interface RejectionCluster {
    reasonCode: string;
    count: number;
    percentage: number;
    decisionSources: {
        source: DecisionSource;
        count: number;
    }[];
    decisionStages: {
        stage: DecisionStage;
        count: number;
    }[];
    examples: DecisionLogEntry[];
}
export interface ReplacementCluster {
    replacementType: string;
    count: number;
    percentage: number;
    reasonCodes: {
        code: string;
        count: number;
    }[];
    examples: DecisionLogEntry[];
}
export interface DecisionQualityReport {
    timeRange: {
        start: Date;
        end: Date;
    };
    totalLogs: number;
    topRejectionReasons: RejectionCluster[];
    topReplacementReasons: ReplacementCluster[];
    byStage: {
        stage: DecisionStage;
        count: number;
        rejectionCount: number;
        replacementCount: number;
    }[];
    bySource: {
        source: DecisionSource;
        count: number;
        rejectionCount: number;
        replacementCount: number;
    }[];
    byPersona: {
        persona: 'ABU' | 'DR_DRE' | 'NEPTUNE';
        count: number;
        rejectionCount: number;
        replacementCount: number;
    }[];
    qualityMetrics: {
        rejectionRate: number;
        replacementRate: number;
        realityDrivenRatio: number;
        avgDecisionsPerTrip: number;
    };
}
export declare class DecisionLogClusteringService {
    private readonly logStorage;
    private readonly logger;
    constructor(logStorage: DecisionLogStorageService);
    analyzeRejectionReasons(filters: {
        countryCode?: string;
        routeDirectionId?: string;
        startDate?: Date;
        endDate?: Date;
        limit?: number;
    }): Promise<RejectionCluster[]>;
    analyzeReplacementReasons(filters: {
        countryCode?: string;
        routeDirectionId?: string;
        startDate?: Date;
        endDate?: Date;
        limit?: number;
    }): Promise<ReplacementCluster[]>;
    generateQualityReport(filters: {
        countryCode?: string;
        routeDirectionId?: string;
        startDate?: Date;
        endDate?: Date;
    }): Promise<DecisionQualityReport>;
}
