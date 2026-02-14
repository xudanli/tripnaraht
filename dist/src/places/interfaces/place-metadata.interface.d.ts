export interface PlaceMetadata {
    openingHours?: {
        weekday?: string;
        weekend?: string;
        lastEntry?: string;
        isOpenNow?: boolean;
        mon?: string;
        tue?: string;
        wed?: string;
        thu?: string;
        fri?: string;
        sat?: string;
        sun?: string;
        osmFormat?: string;
    };
    business_status?: 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY' | 'UNKNOWN';
    contact?: {
        website?: string;
        phone?: string;
        instagram?: string;
    };
    facilities?: {
        wheelchair?: {
            accessible: boolean;
            hasElevator?: boolean;
            hasRestroom?: boolean;
        };
        payment?: string[];
        children?: {
            strollerAccessible?: boolean;
            highChair?: boolean;
        };
        parking?: {
            hasParking?: boolean;
            isFree?: boolean;
        };
        internet?: {
            available: boolean;
            type?: 'wlan' | 'wired' | 'none';
        };
        drinkingWater?: boolean;
        toilets?: boolean;
    };
    rawTags?: string[];
    timezone?: string;
    lastCrawledAt?: string | Date;
    location_score?: {
        center_distance_km?: number;
        nearest_station_walk_min?: number;
        is_transport_hub?: boolean;
        avg_distance_to_attractions_km?: number;
        transport_convenience_score?: number;
    };
    hotel_tier?: number;
    trailId?: number;
    routeId?: string;
    routeSource?: 'alltrails' | 'komoot' | 'internal';
    officialDurationMin?: number;
    googlePopularTimesDurationMin?: number;
    medianDurationBySimilarPoi?: number;
}
