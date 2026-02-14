import { TrailsService } from './trails.service';
import { CreateTrailDto } from './dto/create-trail.dto';
import { UpdateTrailDto } from './dto/update-trail.dto';
import { TrailSupportServicesService } from './services/trail-support-services.service';
import { SmartTrailPlannerService } from './services/smart-trail-planner.service';
import { TrailTrackingService } from './services/trail-tracking.service';
import { RecommendTrailsForPlacesDto } from './dto/trail-recommendation.dto';
export declare class TrailsController {
    private readonly trailsService;
    private readonly supportServicesService;
    private readonly smartPlannerService;
    private readonly trackingService;
    constructor(trailsService: TrailsService, supportServicesService: TrailSupportServicesService, smartPlannerService: SmartTrailPlannerService, trackingService: TrailTrackingService);
    create(createTrailDto: CreateTrailDto): Promise<any>;
    findAll(placeId?: string, difficulty?: string, minDistance?: string, maxDistance?: string, source?: string): Promise<({
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
    update(id: number, updateTrailDto: UpdateTrailDto): Promise<any>;
    remove(id: number): Promise<{
        message: string;
    }>;
    recommendForPlaces(dto: RecommendTrailsForPlacesDto): Promise<any>;
    findPlacesAlong(id: number, radiusKm?: string): Promise<any>;
    splitIntoSegments(id: number, maxSegmentLengthKm?: string): Promise<{
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
    getSupportServices(id: number): Promise<import("./services/trail-support-services.service").TrailSupportService[]>;
    checkSuitability(id: number, body: {
        max_daily_hp: number;
        walk_speed_factor: number;
        terrain_filter?: string;
    }): Promise<{
        suitable: boolean;
        reason?: string;
        fatigueResult: import("./utils/trail-fatigue-calculator.util").TrailFatigueResult;
    }>;
    smartPlan(body: {
        placeIds: number[];
        pacingConfig: {
            max_daily_hp: number;
            walk_speed_factor: number;
            terrain_filter?: string;
        };
        preferences?: {
            maxTotalDistanceKm?: number;
            maxSegmentDistanceKm?: number;
            preferredDifficulty?: string;
            preferOffRoad?: boolean;
            allowSplit?: boolean;
        };
    }): Promise<import("./services/smart-trail-planner.service").SmartTrailPlanResult>;
    startTracking(body: {
        trailId: number;
        itineraryItemId?: string;
    }): Promise<{
        sessionId: string;
    }>;
    addTrackingPoint(sessionId: string, point: {
        latitude: number;
        longitude: number;
        elevation?: number;
        accuracy?: number;
        speed?: number;
    }): Promise<{
        success: boolean;
        deviation?: number;
    }>;
    stopTracking(sessionId: string): Promise<import("./services/trail-tracking.service").TrailTrackingSession>;
    getTrackingSession(sessionId: string): Promise<import("./services/trail-tracking.service").TrailTrackingSession>;
}
