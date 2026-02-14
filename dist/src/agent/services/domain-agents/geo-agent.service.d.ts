import { GeoAgent, GeoPoint, EvidenceRef, DataQuality } from '../../interfaces/sub-agent.interface';
import { DEMElevationService } from '../../../trips/dem/services/dem-elevation.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { RealtimeRoadStatusService } from '../../../skills/world/services/realtime-road-status.service';
export declare class GeoAgentService implements GeoAgent {
    private readonly prisma;
    private readonly demService?;
    private readonly realtimeRoadStatusService?;
    private readonly logger;
    constructor(prisma: PrismaService, demService?: DEMElevationService, realtimeRoadStatusService?: RealtimeRoadStatusService);
    analyzeTerrain(route: GeoPoint[]): Promise<{
        elevation_profile: Array<{
            distance_km: number;
            elevation_m: number;
        }>;
        total_ascent_m: number;
        total_descent_m: number;
        max_elevation_m: number;
        min_elevation_m: number;
        max_slope_deg: number;
        terrain_type: 'FLAT' | 'HILLY' | 'MOUNTAINOUS' | 'ALPINE';
        difficulty: 'EASY' | 'MODERATE' | 'HARD' | 'EXPERT';
        evidence: EvidenceRef[];
        data_quality: DataQuality;
    }>;
    checkRouteFeasibility(origin: GeoPoint, destination: GeoPoint, transportMode: 'DRIVE' | 'WALK' | 'CYCLE' | 'TRANSIT'): Promise<{
        is_reachable: boolean;
        blocking_factors?: string[];
        estimated_duration_min: number;
        estimated_distance_km: number;
        difficulty: 'EASY' | 'MODERATE' | 'HARD' | 'EXPERT';
        confidence: number;
        evidence: EvidenceRef[];
        data_quality: DataQuality;
    }>;
    findNearbyPOIs(center: GeoPoint, radius_km: number, categories?: string[]): Promise<{
        pois: Array<{
            poi_id: string;
            name: string;
            category: string;
            location: GeoPoint;
            distance_km: number;
        }>;
        evidence: EvidenceRef[];
        data_quality: DataQuality;
    }>;
    private calculateDistance;
    private getTerrainType;
    private getDifficulty;
    private createDataQuality;
}
