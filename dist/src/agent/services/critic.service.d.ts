import { AgentState } from '../interfaces/agent-state.interface';
import { EventTelemetryService } from './event-telemetry.service';
export declare class CriticService {
    private eventTelemetry?;
    private readonly logger;
    constructor(eventTelemetry?: EventTelemetryService);
    validateFeasibility(state: AgentState): Promise<{
        pass: boolean;
        violations: Array<{
            type: string;
            message: string;
            node_id?: number;
            details?: any;
        }>;
        min_slack?: number;
        total_wait?: number;
    }>;
    private checkTimeWindows;
    private checkDayBoundaries;
    private checkLunchAnchors;
    private checkRobustTravelTime;
    private extractRequiredPoiKeywords;
    private extractRequiredDays;
    private checkWaitVisibility;
    private calculateMinSlack;
    private calculateTotalWait;
    private parseTime;
}
