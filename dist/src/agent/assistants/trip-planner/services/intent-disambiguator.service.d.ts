import { TripPlannerIntent, TripPlannerState } from '../interfaces/trip-planner.interface';
import { DisambiguationResult, ClarificationRequest } from '../interfaces/intent-uncertainty.interface';
import { ContextAnalyzerService } from './context-analyzer.service';
export declare class IntentDisambiguatorService {
    private readonly contextAnalyzer;
    private readonly logger;
    constructor(contextAnalyzer: ContextAnalyzerService);
    disambiguate(message: string, intent: TripPlannerIntent, state: TripPlannerState): Promise<DisambiguationResult>;
    private detectExplicitAction;
    private resolveUncertainty;
    private handleExplicitAdd;
    private handleQueryWithGapDiscovery;
    private handleCriticalGapDiscovery;
    private handleSuggestedGapDiscovery;
    private handleAmbiguousAction;
    private generateTargetClarification;
    private getGapContextExplanation;
    private getGapActionLabel;
    handleClarificationResponse(userResponse: string, clarificationRequest: ClarificationRequest, state: TripPlannerState): DisambiguationResult;
    private matchSelectedOption;
    private parseFreetextResponse;
}
