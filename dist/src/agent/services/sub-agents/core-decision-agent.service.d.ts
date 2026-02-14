import { CoreDecisionAgent } from '../../interfaces/sub-agent.interface';
import { TripPlanRequest, OrchestratorState, Itinerary } from '../../interfaces/trip-plan.interface';
import { ToTEvaluatorService } from '../../../trips/decision/tot/tot-evaluator.service';
import { RankingService } from '../../../planning-policy/services/ranking.service';
import { DecisionOutput, TradeoffDimension } from '../../interfaces/decision-node.interface';
export declare class ClaudeCoreDecisionAgentService implements CoreDecisionAgent {
    private readonly totEvaluator?;
    private readonly rankingService?;
    private readonly logger;
    private readonly DEFAULT_WEIGHTS;
    constructor(totEvaluator?: ToTEvaluatorService, rankingService?: RankingService);
    makeDecision(candidates: Array<{
        itinerary: Itinerary;
        score: number;
        pros: string[];
        cons: string[];
        evidence_refs: string[];
    }>, request: TripPlanRequest, context: OrchestratorState): Promise<{
        selected_itinerary: Itinerary;
        decision_reasoning: string;
        rejected_candidates: Array<{
            itinerary_id: string;
            reason: string;
        }>;
    }>;
    private generateDecisionReasoning;
    analyzeDecision(candidates: Array<{
        itinerary: Itinerary;
        score: number;
        pros: string[];
        cons: string[];
        evidence_refs: string[];
    }>, request: TripPlanRequest, context: OrchestratorState, userPreferences?: {
        priority?: TradeoffDimension;
        risk_tolerance?: 'LOW' | 'MEDIUM' | 'HIGH';
        weights?: Partial<Record<TradeoffDimension, number>>;
    }): Promise<DecisionOutput>;
    private analyzeCandidate;
    private rankOptions;
    private buildComparisonMatrix;
    private identifyUserJudgmentPoints;
    private buildDecisionNode;
    private normalizeWeights;
    private calculateTimeScore;
    private calculateCostScore;
    private calculateExperienceScore;
    private calculateRiskScore;
    private calculateUncertainty;
    private calculateOverallUncertainty;
    private buildTradeoffModels;
    private generatePlanName;
    private generatePlanDescription;
    private generateWhatYouPayFor;
    private generateWhatYouGet;
    private summarizeEvidence;
}
