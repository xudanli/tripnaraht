import { PacingConfig } from '../interfaces/pacing-config.interface';
import { PhysicalMetadata } from '../../places/interfaces/physical-metadata.interface';
export interface RouteNode {
    placeId?: number;
    name: string;
    type: 'ACTIVITY' | 'REST' | 'MEAL' | 'TRANSIT';
    duration: number;
    physicalMetadata?: PhysicalMetadata;
    terrain?: 'FLAT' | 'HILLY' | 'STAIRS_ONLY' | 'ELEVATOR_AVAILABLE';
    location?: {
        lat: number;
        lng: number;
    };
}
export interface SimulatedNode extends RouteNode {
    currentHP: number;
    hpCost: number;
    forcedRest?: boolean;
    transitTime?: number;
}
export declare class HPSimulator {
    static simulateRoute(route: RouteNode[], config: PacingConfig): SimulatedNode[];
    private static shouldForceRest;
    private static createRestNode;
    private static calculateWalkTime;
    private static haversineDistance;
    private static toRadians;
    private static calculateTransitCost;
    private static calculateActivityCost;
}
