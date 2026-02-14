import { PhysicalRealityRetrievalService, RoadStateInfo } from './physical-reality-retrieval.service';
import { DEMElevationService } from '../../dem/services/dem-elevation.service';
export interface RoadTerrainFeatures {
    roadId: string;
    startElevation?: number;
    endElevation?: number;
    avgElevation?: number;
    maxElevation?: number;
    minElevation?: number;
    totalAscent?: number;
    totalDescent?: number;
    avgSlope?: number;
    maxSlope?: number;
    terrainComplexity?: number;
    demAvailable: boolean;
}
export interface EnhancedRoadStateInfo extends RoadStateInfo {
    terrainFeatures?: RoadTerrainFeatures;
}
export declare class PhysicalRealityDEMAssociationService {
    private readonly physicalRealityService?;
    private readonly demService?;
    private readonly logger;
    constructor(physicalRealityService?: PhysicalRealityRetrievalService, demService?: DEMElevationService);
    enhanceRoadStateWithDEM(roadState: RoadStateInfo): Promise<EnhancedRoadStateInfo>;
    enhanceRoadStatesWithDEM(roadStates: RoadStateInfo[]): Promise<EnhancedRoadStateInfo[]>;
    private calculateTerrainFeatures;
    private calculateDistance;
    private toRadians;
    private calculateTerrainComplexity;
    retrieveAndEnhanceRoadStates(region: string, options?: {
        lat?: number;
        lng?: number;
        month?: number;
        limit?: number;
    }): Promise<EnhancedRoadStateInfo[]>;
}
