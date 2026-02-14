import { ExtendedDataSourceInfo } from '../../../data-quality/interfaces/source-annotation.interface';
export interface EvidenceChainItem {
    step: number;
    operation: string;
    input: string;
    output: string;
    method: string;
    dataSource?: ExtendedDataSourceInfo;
}
export interface ThreeLayerExplanation {
    layer1_conclusion: {
        statement: string;
        confidence: number;
    };
    layer2_reason: {
        primaryFactors: string[];
        contributingFactors?: string[];
        explanation: string;
    };
    layer3_evidence: {
        dataSources: ExtendedDataSourceInfo[];
        calculationMethod?: string;
        assumptions: string[];
        limitations: string[];
        evidenceChain: EvidenceChainItem[];
    };
}
export interface UserFriendlyExplanation {
    shortConclusion: string;
    detailedExplanation: ThreeLayerExplanation;
    expandable: boolean;
}
