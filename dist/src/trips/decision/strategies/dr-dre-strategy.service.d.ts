import { DecisionPersonaStrategy } from './decision-persona-strategy.interface';
import { WorldModelContext, RoutePlanDraft } from '../shared/world-model.types';
import { DecisionResult } from '../shared/decision-result.types';
import { FatigueCalculatorService } from '../services/fatigue-calculator.service';
import { AirbnbIntegrationService } from '../../../mcp/airbnb-integration.service';
import { BookingComIntegrationService } from '../../../mcp/booking-com-integration.service';
export declare class DrDreStrategy implements DecisionPersonaStrategy {
    private readonly fatigueCalculator;
    private readonly airbnbIntegration?;
    private readonly bookingComIntegration?;
    private readonly logger;
    readonly personaName: "DR_DRE";
    constructor(fatigueCalculator: FatigueCalculatorService, airbnbIntegration?: AirbnbIntegrationService, bookingComIntegration?: BookingComIntegrationService);
    evaluate(world: WorldModelContext, plan: RoutePlanDraft): Promise<DecisionResult>;
    private buildPaceConstraints;
    private buildDayProfiles;
    private detectRollingFatigue;
    private planSplitDay;
    private buildDayProfileFromSegments;
    private planBufferDay;
    private applyOp;
    private applySplit;
    private applyBuffer;
    private describeOp;
}
