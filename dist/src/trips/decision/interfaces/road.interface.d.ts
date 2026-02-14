export type RoadStatus = 'OPEN' | 'CLOSED' | 'SEASONAL' | 'RESTRICTED';
export type HazardTag = 'AVALANCHE' | 'FLOOD' | 'MUDSLIDE' | 'NONE';
export interface Road {
    id: string;
    segmentId?: string;
    status: RoadStatus;
    seasonOpenFrom?: number;
    seasonOpenTo?: number;
    hazardTag: HazardTag;
    ferryRouteId?: string;
    metadata?: Record<string, any>;
}
