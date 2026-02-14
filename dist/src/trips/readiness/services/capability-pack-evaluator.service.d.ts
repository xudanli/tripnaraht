import { TripContext } from '../types/trip-context.types';
import { CapabilityPackConfig, CapabilityPackResult } from '../types/capability-pack.types';
import { ReadinessPack } from '../types/readiness-pack.types';
export declare class CapabilityPackEvaluatorService {
    private readonly logger;
    private readonly ruleEngine;
    evaluatePack(pack: CapabilityPackConfig, context: TripContext): CapabilityPackResult;
    convertToReadinessPack(pack: CapabilityPackConfig, destinationId: string, geo?: TripContext['geo']): ReadinessPack;
    private evaluateTrigger;
    private evaluateCondition;
    private getPathValue;
    private compareValue;
    private convertCapabilityConditionToCondition;
}
