export interface TravelerProfile {
    nationality?: string;
    residencyCountry?: string;
    tags?: string[];
    budgetLevel?: 'low' | 'medium' | 'high';
    riskTolerance?: 'low' | 'medium' | 'high';
    relianceOnPhone?: boolean;
    preexistingConditions?: boolean;
}
export interface ItineraryInfo {
    countries: string[];
    transitCountries?: string[];
    transitsMainlandNorway?: boolean;
    activities?: string[];
    season?: string;
    poiCanonicalTypes?: string[];
    hasRemoteAreas?: boolean;
    requires4x4?: boolean;
    isTightSchedule?: boolean;
    hasTightConnections?: boolean;
    routeLength?: number;
}
export interface TripContext {
    traveler: TravelerProfile;
    trip: {
        startDate?: string;
        endDate?: string;
    };
    itinerary: ItineraryInfo;
    geo?: {
        rivers?: {
            nearRiver?: boolean;
            nearestRiverDistanceM?: number;
            riverCrossingCount?: number;
            riverDensityScore?: number;
        };
        mountains?: {
            inMountain?: boolean;
            mountainElevationAvg?: number;
            terrainComplexity?: number;
            hasMountainPass?: boolean;
        };
        roads?: {
            nearRoad?: boolean;
            roadDensityScore?: number;
            hasMountainPass?: boolean;
        };
        coastlines?: {
            nearCoastline?: boolean;
            isCoastalArea?: boolean;
        };
        pois?: {
            topPickupPoints?: Array<{
                category: string;
                score: number;
            }>;
            hasHarbour?: boolean;
            trailAccessPoints?: Array<{
                poi_id: string;
                category: string;
            }>;
            hasEVCharger?: boolean;
            hasFerryTerminal?: boolean;
            supplyDensity?: number;
            hasCheckpoint?: boolean;
            safety?: {
                hasHospital?: boolean;
                hasPolice?: boolean;
            };
            supply?: {
                hasFuel?: boolean;
                hasSupermarket?: boolean;
            };
        };
        latitude?: number;
        longitude?: number;
        altitude_m?: number;
        fuelDensity?: number;
        checkpointCount?: number;
        mountainPassCount?: number;
        oxygenStationCount?: number;
    };
}
export declare function requiresSchengenVisa(nationality?: string): boolean;
