import { UncertaintyModel, UncertaintySourceType, ScenarioAnalysis, UserFacingUncertaintyDisplay } from '../interfaces/uncertainty-model.interface';
import { ExtendedDataSourceInfo } from '../../data-quality/interfaces/source-annotation.interface';
export declare class UncertaintyModelingService {
    private readonly logger;
    createUncertaintyModel(sourceType: UncertaintySourceType, bestEstimate: number, historicalData?: number[], dataSource?: ExtendedDataSourceInfo): UncertaintyModel;
    analyzeScenarios(route: any, uncertainties: UncertaintyModel[]): ScenarioAnalysis;
    presentUncertainty(uncertainty: UncertaintyModel): UserFacingUncertaintyDisplay;
    private calculateBounds;
    private calculateConfidence;
    private determineUncertaintyLevel;
    private inferDistributionType;
    private calculateDistributionParams;
    private calculateBaseCase;
    private calculateBestCase;
    private calculateWorstCase;
    private calculateRisk;
    private calculateRiskContribution;
    private generateUncertaintyExplanation;
    private generateUncertaintyVisualization;
    private generateSuggestion;
    private getUncertaintyLevelLabel;
    private mapSourceTypeToDataSourceType;
    private mapUncertaintyLevelToReliability;
    private getSourceName;
}
