import { Condition } from '../types/readiness-pack.types';
import { TripContext } from '../types/trip-context.types';
export declare class RuleEngine {
    evaluate(condition: Condition | undefined | null, context: TripContext): boolean;
    private evaluateGeoCondition;
    private getPathValue;
    isRuleApplicable(rule: {
        appliesTo?: {
            seasons?: string[];
            activities?: string[];
            travelerTags?: string[];
        };
    }, context: TripContext): boolean;
}
