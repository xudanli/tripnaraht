import { ExplainableOutput } from '../interfaces/product.interface';
import { DecisionLogEntry } from '../../interfaces/trip-plan.interface';
import { EvidenceRef } from '../../interfaces/trip-plan.interface';
export declare class ExplainableOutputService {
    private readonly logger;
    generateExplanation(decisionLog: DecisionLogEntry[], evidenceRefs: EvidenceRef[], modelVersion: string, traceId: string): Promise<ExplainableOutput>;
    private generateSummary;
    private generateDecisionProcess;
    private buildEvidenceChain;
    private generateVisualization;
    generateUserFriendlyExplanation(explanation: ExplainableOutput): string;
}
