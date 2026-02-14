import { PlaceCategory } from '@prisma/client';
import { PhysicalMetadata } from '../../places/interfaces/physical-metadata.interface';
export interface PlaceNode {
    id: number;
    name: string;
    category: PlaceCategory;
    location: {
        lat: number;
        lng: number;
    };
    physicalMetadata?: PhysicalMetadata;
    intensity?: 'LOW' | 'MEDIUM' | 'HIGH';
    estimatedDuration?: number;
    openingHours?: {
        start?: string;
        end?: string;
    };
    timeWindow?: {
        earliest: string;
        latest: string;
    };
    serviceTime?: number;
    isRestaurant?: boolean;
    isRest?: boolean;
    trailId?: number;
    trailData?: {
        distanceKm: number;
        elevationGainM: number;
        maxElevationM?: number;
        difficultyLevel?: string;
        estimatedDurationHours?: number;
    };
}
export interface RouteSolution {
    nodes: PlaceNode[];
    schedule: Array<{
        nodeIndex: number;
        startTime: string;
        endTime: string;
        transportTime?: number;
    }>;
    happinessScore: number;
    scoreBreakdown: {
        interestScore: number;
        distancePenalty: number;
        tiredPenalty: number;
        boredPenalty: number;
        starvePenalty: number;
        clusteringBonus: number;
        bufferBonus: number;
    };
    zones?: Zone[];
}
export interface Zone {
    id: number;
    centroid: {
        lat: number;
        lng: number;
    };
    places: PlaceNode[];
    radius: number;
}
export interface OptimizationConfig {
    date: string;
    startTime: string;
    endTime: string;
    pacingFactor: number;
    hasChildren?: boolean;
    hasElderly?: boolean;
    lunchWindow?: {
        start: string;
        end: string;
    };
    dinnerWindow?: {
        start: string;
        end: string;
    };
    clustering?: {
        minPoints?: number;
        epsilon?: number;
    };
    useVRPTW?: boolean;
}
export interface VRPTWInput {
    locations: Array<{
        id: number;
        name: string;
        window?: [string, string];
        duration: number;
    }>;
    timeMatrix: number[][];
    startIndex?: number;
    endIndex?: number;
}
export interface VRPTWResult {
    route: number[];
    arrivalTimes: string[];
    departureTimes: string[];
    feasible: boolean;
    violations?: Array<{
        locationId: number;
        locationName: string;
        expectedWindow: [string, string];
        actualArrival: string;
        violationType: 'EARLY' | 'LATE';
    }>;
}
