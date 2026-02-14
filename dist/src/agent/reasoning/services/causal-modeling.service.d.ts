import { CausalRelation, CausalChain, CausalReasoningResult, CausalReasoningOptions } from '../interfaces/causal-modeling.interface';
import { ReasoningGraph } from '../interfaces/graph-reasoning.interface';
import { GraphReasoningService } from './graph-reasoning.service';
export declare class CausalModelingService {
    private readonly graphReasoningService;
    private readonly logger;
    constructor(graphReasoningService: GraphReasoningService);
    identifyCausalRelations(graph: ReasoningGraph, options?: CausalReasoningOptions): Promise<CausalRelation[]>;
    buildCausalChains(graph: ReasoningGraph, relations: CausalRelation[], options?: CausalReasoningOptions): Promise<CausalChain[]>;
    private buildChainsFromNode;
    reason(graph: ReasoningGraph, targetNodeId?: string, options?: CausalReasoningOptions): Promise<CausalReasoningResult>;
    private determineCausalRelationType;
    private determineCausalStrength;
    private calculateCausalConfidence;
    private compareStrength;
    private findRelatedEvidence;
    private determineTemporalOrder;
    private calculateChainStrength;
    private calculateChainConfidence;
    private findRootCauses;
    private findEffects;
    private generateCausalExplanation;
    private generateChainExplanation;
    private generateReasoningExplanation;
}
