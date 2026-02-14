import { TripState } from '../../../trips/decision/shared/trip-state.types';
import { LangGraphState } from '../../../trips/decision/orchestration/langgraph-orchestrator.interface';
export interface PublicState {
    user_intent: string;
    strategy_mode?: string;
    strategy_params_summary?: string;
    world_summary: {
        countryCode?: string;
        season?: string;
        routeDirectionId?: number;
        routeDirectionName?: string;
    };
    planning_phase: string;
    riskSignals?: string[];
    decisionLogSummary: Array<{
        agent: string;
        action: string;
        reasonCode: string;
        explanation: string;
        timestamp: string;
    }>;
    rejectionLogSummary?: string[];
    planSummary?: {
        totalDays: number;
        totalSegments: number;
        keyHighlights: string[];
    };
    topCountryBlocks?: string[];
}
export interface PrivateState {
    fullState?: TripState;
    fullLangGraphState?: LangGraphState;
    toolRawOutputs: Record<string, any>;
    debugLogs: string[];
    internalScores?: Record<string, any>;
    privateFields?: Record<string, any>;
    longLists: {
        pois?: string;
        waypoints?: string;
        segments?: string;
        [key: string]: string | undefined;
    };
    largeFileRefs: {
        gpx?: string;
        geojson?: string;
        csv?: string;
        [key: string]: string | undefined;
    };
    intermediateResults?: Record<string, any>;
}
export interface StateProjection {
    public: PublicState;
    private: PrivateState;
    metadata: {
        projectedAt: string;
        tokenCount: number;
        truncated: boolean;
    };
}
export interface ProjectionConfig {
    includeFullState?: boolean;
    decisionLogLimit?: number;
    rejectionLogLimit?: number;
    tokenBudget?: number;
}
