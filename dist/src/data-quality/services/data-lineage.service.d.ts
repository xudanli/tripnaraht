import { LineageTree, UserFriendlyExplanation, LineageQueryOptions } from '../interfaces/data-lineage.interface';
import { SourceAnnotationService } from './source-annotation.service';
export declare class DataLineageService {
    private readonly sourceAnnotationService;
    private readonly logger;
    constructor(sourceAnnotationService: SourceAnnotationService);
    traceLineage(finalOutput: any, context?: {
        dataSources?: Record<string, any>;
        processingHistory?: Array<{
            operation: string;
            input: any[];
            output: any;
            method: string;
            parameters?: Record<string, any>;
            timestamp?: string;
            duration?: number;
        }>;
        assumptions?: string[];
        limitations?: string[];
    }): Promise<LineageTree>;
    generateUserFriendlyExplanation(lineage: LineageTree, options?: LineageQueryOptions): Promise<UserFriendlyExplanation>;
    queryLineage(outputValue: any, options?: LineageQueryOptions): Promise<{
        lineage: LineageTree;
        explanation?: UserFriendlyExplanation;
    }>;
    private summarizeData;
    private calculateFreshness;
    private createDefaultSourceInfo;
    private inferInputSourceIds;
    private dataMatches;
    private calculateFinalConfidence;
    private generateDefaultAssumptions;
    private generateDefaultLimitations;
    private generateSummary;
    private generateDetailedExplanation;
    private generateSourceExplanation;
    private generateProcessExplanation;
    private generateConfidenceExplanation;
    private generateVisualization;
}
