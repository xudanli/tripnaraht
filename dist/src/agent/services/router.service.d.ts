import { RouterOutput } from '../interfaces/router.interface';
import { EventTelemetryService } from './event-telemetry.service';
export declare class RouterService {
    private eventTelemetry?;
    private readonly logger;
    constructor(eventTelemetry?: EventTelemetryService);
    route(userInput: string, context?: {
        tripId?: string | null;
        recentMessages?: string[];
        userId?: string;
    }, requestId?: string): Promise<RouterOutput>;
    private checkHardRules;
    private extractFeatures;
    private scoreFeatures;
    private decideRoute;
    private getRequiredCapabilities;
    private requiresConsent;
    private getBudget;
    private getInitialUIStatus;
    private getUIMessage;
}
