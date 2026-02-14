import { PlaceNode, RouteSolution, OptimizationConfig } from '../interfaces/route-optimization.interface';
export declare class HappinessScorerService {
    calculateHappinessScore(nodes: PlaceNode[], schedule: RouteSolution['schedule'], config: OptimizationConfig, zones?: {
        id: number;
        places: PlaceNode[];
    }[]): RouteSolution['scoreBreakdown'];
    private calculateDistancePenalty;
    private calculateTiredPenalty;
    private calculateTrailFatiguePenalty;
    private calculateBoredPenalty;
    private calculateStarvePenalty;
    private calculateClusteringBonus;
    private getZonesForNodes;
    private calculateBufferBonus;
    private getIntensity;
    private calculateDistance;
    private toRadians;
}
