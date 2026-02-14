import { RawData, ProcessedData, DecisionData, UIData, DataFlowConfig, DataFlowResult } from '../interfaces/data-architecture.interface';
import { DataQualityFrameworkService } from '../../data-quality/services/data-quality-framework.service';
import { DataConflictResolutionService } from '../../data-fusion/services/data-conflict-resolution.service';
export declare class DataArchitectureService {
    private readonly dataQualityFramework;
    private readonly dataConflictResolution;
    private readonly logger;
    constructor(dataQualityFramework: DataQualityFrameworkService, dataConflictResolution: DataConflictResolutionService);
    executeDataFlow(sources: Array<{
        sourceId: string;
        sourceName: string;
        data: any;
        timestamp?: string;
    }>, config?: DataFlowConfig): Promise<DataFlowResult>;
    collectAndStore(sources: Array<{
        sourceId: string;
        sourceName: string;
        data: any;
        timestamp?: string;
    }>, config?: Record<string, any>): Promise<RawData[]>;
    processAndFuse(rawData: RawData[], config: Required<DataFlowConfig>): Promise<ProcessedData>;
    prepareDecisionData(processedData: ProcessedData, config?: Record<string, any>): Promise<DecisionData>;
    prepareUIData(decisionData: DecisionData, config?: Record<string, any>): Promise<UIData>;
    private inferSourceType;
    private inferDataFormat;
    private performFeatureEngineering;
    private normalize;
    private generateDecisionOptions;
    private generateRecommendations;
    private formatDisplayData;
    private generateThreeLayerExplanations;
    private generateInteractions;
    private determineQualityLevel;
    private calculateLayerQuality;
    private calculateDecisionDataQuality;
}
