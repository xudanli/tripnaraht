import { NarratorAgent } from '../../interfaces/sub-agent.interface';
import { Itinerary, GateResult, DecisionLogEntry, OrchestratorState } from '../../interfaces/trip-plan.interface';
import { NarratorAgentService as LangGraphNarratorAgentService } from '../../../trips/decision/orchestration/narrator-agent.service';
import { DecisionExplainForHumanSkill } from '../../../skills/decision/decision-explain-for-human.skill';
import { LlmService } from '../../../llm/services/llm.service';
import { DecisionOutput, ComparisonMatrix } from '../../interfaces/decision-node.interface';
export interface DecisionStory {
    elimination_narrative: {
        title: string;
        eliminated_options: Array<{
            name: string;
            reason: string;
            what_you_would_lose: string;
        }>;
        summary: string;
    };
    finalist_narrative: {
        title: string;
        finalists: Array<{
            name: string;
            strengths: string[];
            weaknesses: string[];
            best_for: string;
        }>;
        comparison_summary: string;
    };
    recommendation_narrative: {
        title: string;
        recommended: string;
        confidence: string;
        reasoning: string;
        what_you_pay_for: string;
        what_you_get: string;
    };
}
export interface DecisionVisualization {
    comparison_visualization: {
        type: 'radar' | 'bar' | 'table';
        data: ComparisonMatrix;
        highlights: Array<{
            dimension: string;
            winner: string;
            margin: string;
        }>;
    };
    risk_visualization: {
        type: 'gauge' | 'bar';
        overall_risk: number;
        risk_breakdown: Array<{
            category: string;
            level: number;
            description: string;
        }>;
    };
    uncertainty_visualization: {
        type: 'range' | 'distribution';
        confidence_level: number;
        confidence_label: string;
        uncertainty_factors: Array<{
            factor: string;
            impact: string;
        }>;
    };
}
export declare class ClaudeNarratorAgentService implements NarratorAgent {
    private readonly langGraphNarrator?;
    private readonly decisionExplainSkill?;
    private readonly llmService?;
    private readonly logger;
    constructor(langGraphNarrator?: LangGraphNarratorAgentService, decisionExplainSkill?: DecisionExplainForHumanSkill, llmService?: LlmService);
    narrate(itinerary: Itinerary, gateResult: GateResult, decisionLog: DecisionLogEntry[], context: OrchestratorState): Promise<{
        user_friendly_summary: string;
        day_by_day_narrative: Array<{
            day: number;
            date: string;
            narrative: string;
        }>;
        highlights: string[];
        tips: string[];
        warnings?: string[];
    }>;
    generateSimplifiedDecisionLog(decisionLog: DecisionLogEntry[], gateResult: GateResult): {
        summary: string;
        key_decisions: Array<{
            step: string;
            decision: string;
            impact: 'HIGH' | 'MEDIUM' | 'LOW';
        }>;
        evidence_count: number;
        has_details: boolean;
    };
    private isKeyDecision;
    private simplifyDecisionMessage;
    private assessDecisionImpact;
    private generateDecisionSummary;
    private translateGateResult;
    private generateSummary;
    private generateDayNarrative;
    private extractHighlights;
    private generateTips;
    private generateWarnings;
    generateDecisionStory(decisionOutput: DecisionOutput): DecisionStory;
    generateDecisionVisualization(decisionOutput: DecisionOutput): DecisionVisualization;
    generateFullDecisionPresentation(decisionOutput: DecisionOutput, itinerary: Itinerary, gateResult: GateResult): {
        story: DecisionStory;
        visualization: DecisionVisualization;
        narrative: {
            user_friendly_summary: string;
            day_by_day_narrative: Array<{
                day: number;
                date: string;
                narrative: string;
            }>;
            highlights: string[];
            tips: string[];
            warnings?: string[];
        };
        user_actions: Array<{
            action_id: string;
            label: string;
            description: string;
            impact: string;
        }>;
    };
    private generateEliminationReason;
    private extractStrengths;
    private extractWeaknesses;
    private generateBestForStatement;
    private generateComparisonSummary;
    private generateRecommendationReasoning;
    private getConfidenceLabel;
    private extractComparisonHighlights;
    private generateRiskBreakdown;
    private generateUserActions;
}
