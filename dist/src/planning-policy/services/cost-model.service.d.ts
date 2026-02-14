import { CostModel, EdgeCostInput, ItineraryCostInput, PlanningPolicy } from '../interfaces/planning-policy.interface';
export declare class DefaultCostModel implements CostModel {
    edgeCost({ segment, policy }: EdgeCostInput): number;
    itineraryCost(input: ItineraryCostInput, policy: PlanningPolicy): number;
}
export declare const DefaultCostModelInstance: DefaultCostModel;
