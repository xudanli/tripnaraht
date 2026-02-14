import { DecisionPersonaStrategy } from './decision-persona-strategy.interface';
import { WorldModelContext, RoutePlanDraft } from '../shared/world-model.types';
import { DecisionResult } from '../shared/decision-result.types';
import { ExaIntegrationService } from '../../../mcp/exa-integration.service';
import { AirbnbIntegrationService } from '../../../mcp/airbnb-integration.service';
import { BookingComIntegrationService } from '../../../mcp/booking-com-integration.service';
export declare class AbuStrategy implements DecisionPersonaStrategy {
    private readonly exaIntegration?;
    private readonly airbnbIntegration?;
    private readonly bookingComIntegration?;
    private readonly logger;
    readonly personaName: "ABU";
    constructor(exaIntegration?: ExaIntegrationService, airbnbIntegration?: AirbnbIntegrationService, bookingComIntegration?: BookingComIntegrationService);
    evaluate(world: WorldModelContext, plan: RoutePlanDraft): Promise<DecisionResult>;
}
