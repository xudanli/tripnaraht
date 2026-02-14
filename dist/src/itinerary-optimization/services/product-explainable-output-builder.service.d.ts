import { OptimizationResult } from '../interfaces/plan-request.interface';
import { DemDecisionEvidence } from '../../trips/decision/shared/world-model.types';
export interface RuleHit {
    rule_id: string;
    rule_name: string;
    matched: boolean;
    impact: 'BLOCK' | 'PENALTY' | 'BONUS' | 'NEUTRAL';
    severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    details?: string;
}
export interface KeyFeature {
    name: string;
    value: number;
    unit?: string;
    threshold?: number;
    status: 'OK' | 'WARNING' | 'VIOLATION';
    explanation?: string;
}
export interface DataSourceInfo {
    type: 'DEM' | 'TRANSPORT' | 'POI' | 'WEATHER' | 'ROUTE' | 'OPENING_HOURS';
    timestamp: string;
    expiry?: string;
    reliability: 'HIGH' | 'MEDIUM' | 'LOW';
    source: 'API' | 'CACHE' | 'DATABASE' | 'ESTIMATED' | 'DEFAULT';
}
export interface EvidenceChainItem {
    type: 'RULE_HIT' | 'FEATURE' | 'CONSTRAINT' | 'DATA';
    rule_id?: string;
    rule_hit?: RuleHit;
    feature?: KeyFeature;
    constraint?: {
        name: string;
        status: 'SATISFIED' | 'VIOLATED' | 'WARNING';
        details: string;
    };
    data_source?: DataSourceInfo;
}
export interface ActionableStep {
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    action: string;
    estimated_impact: string;
    user_confirmation_required: boolean;
    actionable_items?: Array<{
        type: 'REPLACE_POI' | 'ADD_BUFFER' | 'CHANGE_TRANSPORT' | 'ADJUST_TIME' | 'REMOVE_NODE';
        target: string;
        suggested_value?: any;
    }>;
}
export interface AlternativeRoute {
    route: OptimizationResult;
    comparison?: {
        improvements: Array<{
            dimension: 'COST' | 'RISK' | 'TIME' | 'COMFORT' | 'SAFETY';
            improvement: number;
            evidence: EvidenceChainItem[];
            explanation: string;
        }>;
        tradeoffs: Array<{
            dimension: string;
            loss: number;
            explanation: string;
        }>;
    };
    recommendation: 'ACCEPT' | 'REJECT' | 'NEED_USER_CONFIRM';
}
export interface ProductExplainableOutput {
    conclusion: {
        decision: 'ACCEPT' | 'REJECT' | 'ADJUST';
        confidence: number;
        summary: string;
    };
    evidence: {
        rule_hits: RuleHit[];
        key_features: KeyFeature[];
        data_quality: {
            missing_data: string[];
            stale_data: string[];
            low_reliability: string[];
        };
        evidence_chain: EvidenceChainItem[];
    };
    actionable_steps: ActionableStep[];
    alternatives?: AlternativeRoute[];
}
export declare class ProductExplainableOutputBuilderService {
    private readonly logger;
    buildExplainableOutput(result: OptimizationResult, context?: {
        dem_evidence?: DemDecisionEvidence[];
        rule_hits?: RuleHit[];
        data_quality?: {
            missing: string[];
            stale: string[];
            low_reliability: string[];
        };
        alternatives?: AlternativeRoute[];
    }): Promise<ProductExplainableOutput>;
    private buildConclusion;
    private collectEvidence;
    private extractKeyFeatures;
    private buildEvidenceChain;
    private inferDataSource;
    private generateActionableSteps;
    private generateActionForViolation;
}
