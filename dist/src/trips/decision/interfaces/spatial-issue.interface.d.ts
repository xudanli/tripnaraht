export type SpatialIssueType = 'ENTRY_UNREACHABLE' | 'POI_UNAVAILABLE' | 'SEGMENT_BLOCKED' | 'FERRY_CANCELLED' | 'HAZARD_ZONE';
export interface SpatialIssue {
    issueId: string;
    type: SpatialIssueType;
    segmentId?: string;
    poiId?: string;
    severity: 'HARD' | 'SOFT';
    reason: string;
    originalLocation?: {
        lat: number;
        lng: number;
    };
    metadata?: Record<string, any>;
    meta?: Record<string, any>;
}
export interface NeptuneInput {
    world: import('../shared/world-model.types').WorldModelContext;
    plan: import('../shared/world-model.types').RoutePlanDraft;
    spatialIssues: SpatialIssue[];
    routeDirection: {
        id: string;
        corridorGeom?: string;
        regions?: string[];
        philosophy?: string;
        metadata?: Record<string, any>;
    };
}
