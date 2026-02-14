import { GraphNode, ReasoningGraph } from './graph-reasoning.interface';
export type CausalRelationType = 'DIRECT_CAUSE' | 'INDIRECT_CAUSE' | 'CONTRIBUTING_FACTOR' | 'CONFOUNDING_FACTOR';
export type CausalStrength = 'WEAK' | 'MODERATE' | 'STRONG' | 'VERY_STRONG';
export interface CausalRelation {
    id: string;
    cause: string;
    effect: string;
    type: CausalRelationType;
    strength: CausalStrength;
    confidence: number;
    evidence?: string[];
    explanation?: string;
    metadata?: {
        correlation?: number;
        temporalOrder?: 'BEFORE' | 'SIMULTANEOUS' | 'AFTER';
        mechanism?: string;
    };
}
export interface CausalChain {
    id: string;
    nodes: string[];
    relations: CausalRelation[];
    strength: CausalStrength;
    confidence: number;
    explanation: string;
}
export interface CausalReasoningResult {
    graph: ReasoningGraph;
    causalRelations: CausalRelation[];
    causalChains: CausalChain[];
    rootCauses: GraphNode[];
    effects: GraphNode[];
    overallConfidence: number;
    explanation: string;
}
export interface CausalReasoningOptions {
    minStrength?: CausalStrength;
    minConfidence?: number;
    maxChainLength?: number;
    includeIndirect?: boolean;
    enableCounterfactuals?: boolean;
}
