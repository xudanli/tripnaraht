import { ObjectiveWeights } from '../../route-directions/interfaces/route-direction.interface';
export interface POIRouteAffinity {
    poiId: string;
    routeDirectionId: number;
    affinityScore: number;
    scoreBreakdown: AffinityScoreBreakdown;
    matchReasons: string[];
    mismatchReasons?: string[];
}
export interface AffinityScoreBreakdown {
    tagMatch: {
        score: number;
        weight: number;
        matchedTags: string[];
        totalRouteTags: number;
    };
    typeMatch: {
        score: number;
        weight: number;
        poiType?: string;
        isSignatureType: boolean;
        typeWeight?: number;
    };
    locationMatch: {
        score: number;
        weight: number;
        inRegion: boolean;
        inCorridor: boolean;
        distanceToCorridorKm?: number;
    };
    objectiveMatch: {
        score: number;
        weight: number;
        matchedObjectives: string[];
        objectiveWeights?: ObjectiveWeights;
    };
    exampleBonus: {
        score: number;
        weight: number;
        isExample: boolean;
    };
    seasonalityMatch: {
        score: number;
        weight: number;
        currentMonth?: number;
        isBestMonth: boolean;
        isAvoidMonth: boolean;
    };
}
export interface POIAffinityCalculationOptions {
    currentMonth?: number;
    considerLocation?: boolean;
    considerSeasonality?: boolean;
    customWeights?: {
        tagMatch?: number;
        typeMatch?: number;
        locationMatch?: number;
        objectiveMatch?: number;
        exampleBonus?: number;
        seasonalityMatch?: number;
    };
}
export interface POIInfo {
    id: string;
    name?: string;
    tags?: string[];
    type?: string;
    category?: string;
    location?: {
        lat: number;
        lng: number;
        regionKey?: string;
    };
    metadata?: Record<string, any>;
}
