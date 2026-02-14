export declare enum POILayerType {
    STATIC = "STATIC",
    SEMI_DYNAMIC = "SEMI_DYNAMIC",
    HIGHLY_DYNAMIC = "HIGHLY_DYNAMIC"
}
export interface POIStaticData {
    id: string;
    name: string;
    nameI18n?: Record<string, string>;
    location: {
        lat: number;
        lng: number;
        geom?: any;
        address?: string;
        regionKey?: string;
        regionName?: string;
    };
    category: string;
    subCategory?: string;
    tags: string[];
    source: string;
    externalId?: string;
    createdAt: Date;
    updatedAt: Date;
}
export interface POISemiDynamicData {
    poiId: string;
    openingHours?: {
        raw?: string;
        structured?: {
            [dayOfWeek: string]: Array<{
                open: string;
                close: string;
            }>;
        };
        timezone?: string;
        is24Hours?: boolean;
    };
    pricing?: {
        priceRange?: 'free' | 'low' | 'medium' | 'high' | 'very_high';
        price?: {
            amount: number;
            currency: string;
            unit?: 'per_person' | 'per_group' | 'per_hour' | 'per_day';
        };
        updatedAt?: Date;
    };
    rating?: {
        average?: number;
        count?: number;
        source?: string;
        updatedAt?: Date;
    };
    contact?: {
        phone?: string;
        email?: string;
        website?: string;
        socialMedia?: Record<string, string>;
    };
    requiresBooking?: boolean;
    bookingDifficulty?: number;
    updatedAt: Date;
}
export interface POIHighlyDynamicData {
    poiId: string;
    availability?: {
        isOpen?: boolean;
        isAvailable?: boolean;
        capacityPercentage?: number;
        updatedAt: Date;
    };
    crowding?: {
        level?: number;
        description?: 'empty' | 'quiet' | 'moderate' | 'busy' | 'very_busy' | 'crowded';
        estimatedWaitTime?: number;
        source?: string;
        updatedAt: Date;
    };
    weatherImpact?: {
        isAffected?: boolean;
        impactLevel?: number;
        reason?: string;
        updatedAt: Date;
    };
    events?: Array<{
        type: 'closure' | 'maintenance' | 'special_event' | 'alert';
        description: string;
        startTime: Date;
        endTime?: Date;
        impact?: 'full' | 'partial' | 'minor';
    }>;
    updatedAt: Date;
}
export interface CompletePOIData {
    static: POIStaticData;
    semiDynamic?: POISemiDynamicData;
    highlyDynamic?: POIHighlyDynamicData;
}
export interface RouteGenerationPOIData {
    static: POIStaticData;
    semiDynamic?: POISemiDynamicData;
}
export interface POILayerMetadata {
    layerType: POILayerType;
    source: string;
    updateFrequency: 'static' | 'daily' | 'hourly' | 'realtime';
    lastUpdated: Date;
    qualityScore?: number;
    usableForRouteGeneration: boolean;
}
