import { DecisionDraft, DecisionStep, DecisionExplanation, DecisionQualityMetrics, StudioExplanation } from '../interfaces/decision-draft.interface';
export type ExplanationMode = 'toc' | 'expert' | 'studio';
export interface TocExplanation {
    summary: string;
    decision_count: number;
    key_decisions: Array<{
        title: string;
        conclusion: string;
        confidence: number;
        expandable?: boolean;
    }>;
}
export interface ExpertExplanation {
    decision_steps: DecisionStep[];
    step_drafts: any[];
    evidence_chain: any[];
    decision_log: any[];
    three_guardians_review?: {
        abu?: any;
        dr_dre?: any;
        neptune?: any;
    };
    quality_metrics: DecisionQualityMetrics;
}
export declare class DecisionExplanationService {
    private readonly logger;
    generateExplanation(decisionDraft: DecisionDraft, mode?: ExplanationMode): Promise<TocExplanation | ExpertExplanation | StudioExplanation>;
    private generateTocExplanation;
    private generateExpertExplanation;
    private extractConclusion;
    private calculateQualityMetrics;
    generateStepExplanation(decisionDraft: DecisionDraft, decisionStepId: string): Promise<DecisionExplanation | null>;
    private generateStudioExplanation;
    private generateOptimizationSuggestions;
}
