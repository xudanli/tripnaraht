import { ExtendedDataSourceInfo } from '../../data-quality/interfaces/source-annotation.interface';
export type UncertaintySourceType = 'WEATHER' | 'CROWD' | 'USER_CAPACITY' | 'TRANSPORT' | 'EXPERIENCE' | 'ROUTE_CONDITION' | 'COST' | 'DURATION';
export type UncertaintyLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export interface UncertaintyModel {
    sourceType: UncertaintySourceType;
    bestEstimate: number;
    lowerBound: number;
    upperBound: number;
    confidence: number;
    dataSource: ExtendedDataSourceInfo;
    uncertaintyLevel: UncertaintyLevel;
    distributionType?: 'NORMAL' | 'UNIFORM' | 'TRIANGULAR' | 'BETA';
    distributionParams?: Record<string, number>;
}
export interface ScenarioResult {
    risk: number;
    cost?: number;
    duration?: number;
    experience?: number;
    feasibility: boolean;
    explanation: string;
}
export interface ScenarioAnalysis {
    bestCase: ScenarioResult;
    baseCase: ScenarioResult;
    worstCase: ScenarioResult;
    upsidePotential: number;
    downsideRisk: number;
}
export interface UserFacingUncertaintyDisplay {
    what: string;
    range: string;
    explanation: string;
    visualization?: {
        type: 'BAR' | 'LINE' | 'DISTRIBUTION';
        data: any;
    };
    levelLabel: string;
    suggestion?: string;
}
export interface RiskAssessmentWithUncertainty {
    baseCaseRisk: number;
    bestCaseRisk: number;
    worstCaseRisk: number;
    upsidePotential: number;
    downsideRisk: number;
    recommendation: string;
    uncertaintyDisplay: UserFacingUncertaintyDisplay[];
}
