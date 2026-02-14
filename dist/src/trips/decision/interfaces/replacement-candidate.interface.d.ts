export interface ReplacementCandidate {
    poiId: string;
    lat: number;
    lng: number;
    type: string;
    tags: string[];
    distM: number;
    corridorT: number;
    demDeltaM: number;
    popularity: number;
    metadata?: {
        openingHours?: any;
        access?: string;
        elevationM?: number;
        [key: string]: any;
    };
}
export interface ReplacementOperation {
    type: 'ENTRY_REPLACEMENT' | 'POI_REPLACEMENT' | 'SEGMENT_REPLACEMENT';
    originalPoiId?: string;
    newPoiId?: string;
    originalSegmentId?: string;
    newSegmentIds?: string[];
    score: number;
    explanation: string;
}
