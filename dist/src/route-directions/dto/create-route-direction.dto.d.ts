import { RouteConstraints, RiskProfile, Seasonality, SignaturePois, ItinerarySkeleton, FailureProfile, RouteNarrative } from '../interfaces/route-direction.interface';
export declare class CreateRouteDirectionDto {
    countryCode: string;
    name: string;
    nameCN: string;
    nameEN?: string;
    description?: string;
    tags: string[];
    regions?: string[];
    entryHubs?: string[];
    seasonality?: Seasonality;
    constraints?: RouteConstraints;
    riskProfile?: RiskProfile;
    signaturePois?: SignaturePois;
    itinerarySkeleton?: ItinerarySkeleton;
    metadata?: Record<string, any>;
    isActive?: boolean;
    status?: 'draft' | 'active' | 'deprecated';
    version?: string;
    rolloutPercent?: number;
    audienceFilter?: {
        persona?: string[];
        locale?: string[];
        [key: string]: any;
    };
    failureProfile?: FailureProfile;
    narrative?: RouteNarrative;
    antiPersona?: string[];
}
