import { PrismaService } from '../prisma/prisma.service';
import { CreateTrailDto } from './dto/create-trail.dto';
import { UpdateTrailDto } from './dto/update-trail.dto';
import { TrailCacheService } from './services/trail-cache.service';
export declare class TrailsService {
    private prisma;
    private cacheService;
    constructor(prisma: PrismaService, cacheService: TrailCacheService);
    create(dto: CreateTrailDto): Promise<any>;
    findAll(filters?: {
        placeId?: number;
        difficulty?: string;
        minDistance?: number;
        maxDistance?: number;
        source?: string;
    }): Promise<({
        TrailWaypoint: ({
            Place: {
                id: number;
                nameEN: string;
                nameCN: string;
            };
        } & {
            id: number;
            placeId: number;
            note: string | null;
            trailId: number;
            order: number;
        })[];
        Place_Trail_endPlaceIdToPlace: {
            id: number;
            nameEN: string;
            nameCN: string;
        };
        Place_Trail_startPlaceIdToPlace: {
            id: number;
            nameEN: string;
            nameCN: string;
        };
    } & {
        id: number;
        uuid: string;
        nameEN: string | null;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        rating: number | null;
        createdAt: Date;
        updatedAt: Date;
        nameCN: string;
        description: string | null;
        distanceKm: number | null;
        elevationGainM: number | null;
        elevationLossM: number | null;
        maxElevationM: number | null;
        minElevationM: number | null;
        averageSlope: number | null;
        difficultyLevel: string | null;
        equivalentDistanceKm: number | null;
        fatigueScore: number | null;
        gpxData: import("@prisma/client/runtime/library").JsonValue | null;
        gpxFileUrl: string | null;
        bounds: import("@prisma/client/runtime/library").JsonValue | null;
        startPlaceId: number | null;
        endPlaceId: number | null;
        source: string | null;
        sourceUrl: string | null;
        estimatedDurationHours: number | null;
    })[]>;
    findOne(id: number): Promise<any>;
    update(id: number, dto: UpdateTrailDto): Promise<any>;
    remove(id: number): Promise<{
        message: string;
    }>;
    recommendTrailsForPlaces(placeIds: number[], options?: {
        maxDistance?: number;
        preferOffRoad?: boolean;
        maxDifficulty?: string;
    }): Promise<any>;
    findPlacesAlongTrail(trailId: number, radiusKm?: number): Promise<any>;
    splitTrailIntoSegments(trailId: number, maxSegmentLengthKm?: number): Promise<{
        segmentIndex: number;
        startPoint: {
            lat: number;
            lng: number;
            elevation?: number;
        };
        endPoint: {
            lat: number;
            lng: number;
            elevation?: number;
        };
        distanceKm: number;
        elevationGainM: number;
        estimatedDurationHours: number;
        waypointCount: number;
    }[]>;
    private extractCoordinates;
    private extractTrailPoints;
    private getTrailCenter;
    private calculateBounds;
    private haversineDistance;
    private toRadians;
    private sampleTrailPoints;
    checkTrailSuitability(trailId: number, pacingConfig: {
        max_daily_hp: number;
        walk_speed_factor: number;
        terrain_filter?: string;
    }): Promise<{
        suitable: boolean;
        reason?: string;
        fatigueResult: import("./utils/trail-fatigue-calculator.util").TrailFatigueResult;
    }>;
}
