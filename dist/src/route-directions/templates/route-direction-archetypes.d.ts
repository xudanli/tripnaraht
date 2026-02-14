import { RouteDirectionData } from '../interfaces/route-direction.interface';
export type RouteDirectionArchetype = 'HIGH_ALTITUDE_CULTURAL_TREKKING' | 'FJORD_COASTLINE_DRIVING' | 'URBAN_CULTURAL_EXPLORATION' | 'NATURE_SCENIC_LOOP' | 'ADVENTURE_CHALLENGE_ROUTE' | 'RELAXED_LEISURE_VACATION';
export interface ArchetypeTemplate {
    id: RouteDirectionArchetype;
    nameCN: string;
    nameEN: string;
    description: string;
    defaultTags: string[];
    constraintsTemplate: {
        hard?: Record<string, any>;
        soft?: Record<string, any>;
    };
    riskProfileTemplate: Record<string, any>;
    typicalPace: 'relaxed' | 'moderate' | 'intense';
    seasonalityTemplate: {
        bestMonths?: number[];
        avoidMonths?: number[];
        weatherWindow?: boolean;
    };
    signaturePoiTypes: string[];
    itinerarySkeletonTemplate: {
        dayThemes?: string[];
        restDaysRequired?: number[];
        dailyPace?: string;
    };
    applicableRegions: {
        elevationRange?: {
            min: number;
            max: number;
        };
        terrainTypes?: string[];
        climateZones?: string[];
    };
}
export declare const ROUTE_DIRECTION_ARCHETYPES: Record<RouteDirectionArchetype, ArchetypeTemplate>;
export declare function generateRouteDirectionFromArchetype(archetype: RouteDirectionArchetype, countryCode: string, customizations?: {
    name?: string;
    nameCN?: string;
    nameEN?: string;
    description?: string;
    regions?: string[];
    entryHubs?: string[];
    corridorGeom?: string;
    [key: string]: any;
}): Partial<RouteDirectionData>;
export declare function recommendArchetypesByRegion(regionFeatures: {
    elevation?: number;
    terrainType?: string;
    climateZone?: string;
    hasCoastline?: boolean;
    hasCities?: boolean;
}): Array<{
    archetype: RouteDirectionArchetype;
    score: number;
    reason: string;
}>;
export declare function getAllArchetypes(): ArchetypeTemplate[];
export declare function getArchetypeById(id: RouteDirectionArchetype): ArchetypeTemplate | undefined;
