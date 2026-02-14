export interface RoadStatus {
    isOpen: boolean;
    riskLevel: 0 | 1 | 2 | 3;
    reason?: string;
    lastUpdated: Date;
    source: string;
    metadata?: Record<string, any>;
}
export interface RoadSegment {
    from: {
        lat: number;
        lng: number;
    };
    to: {
        lat: number;
        lng: number;
    };
    status: RoadStatus;
    name?: string;
}
export interface RoadStatusQuery {
    lat: number;
    lng: number;
    radius?: number;
    segments?: Array<{
        from: {
            lat: number;
            lng: number;
        };
        to: {
            lat: number;
            lng: number;
        };
    }>;
    includeFRoadInfo?: boolean;
    includeRiverCrossing?: boolean;
}
export interface ExtendedRoadStatus extends RoadStatus {
    fRoadInfo?: import('./iceland-specific.interface').FRoadInfo;
    riverCrossingInfo?: import('./iceland-specific.interface').RiverCrossingInfo;
    snowDepth?: number;
    windGusts?: number;
}
