export type PacePreference = 'SLOW' | 'MODERATE' | 'FAST';
export type AltitudeTolerance = 'LOW' | 'MEDIUM' | 'HIGH';
export type RiskTolerance = 'LOW' | 'MEDIUM' | 'HIGH';
export type TravelPhilosophy = 'SCENIC' | 'ADVENTURE' | 'RELAXED';
export type RouteType = 'HIKING' | 'ROAD_TRIP' | 'SEA' | 'URBAN' | 'CULTURAL' | 'NATURE';
export interface UserTravelProfile {
    userId: string;
    pacePreference?: PacePreference;
    altitudeTolerance?: AltitudeTolerance;
    riskTolerance?: RiskTolerance;
    travelPhilosophy?: TravelPhilosophy;
    preferredRouteTypes?: RouteType[];
    confidence: number;
    source: 'explicit' | 'inferred' | 'mixed';
    updatedAt: Date;
}
export declare function createDefaultUserTravelProfile(userId: string): UserTravelProfile;
