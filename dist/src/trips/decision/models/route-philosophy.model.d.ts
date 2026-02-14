export interface RoutePhilosophy {
    coreStatement: string;
    mustVisitTags?: string[];
    nonNegotiableRules: string[];
    flexibleParts: string[];
    durationFlexibility?: {
        minDays: number;
        maxDays: number;
        preferredDays?: number;
    };
    metadata?: Record<string, any>;
}
export declare const ICELAND_HIGHLANDS_PHILOSOPHY: RoutePhilosophy;
export declare const NEPAL_EBC_PHILOSOPHY: RoutePhilosophy;
export declare function validateReplacementAgainstPhilosophy(replacement: {
    type: 'POI_REPLACEMENT' | 'SEGMENT_REPLACEMENT' | 'ENTRY_REPLACEMENT';
    originalPoiId?: string;
    newPoiId?: string;
    originalSegmentId?: string;
    newSegmentIds?: string[];
    removedTags?: string[];
    addedTags?: string[];
}, philosophy: RoutePhilosophy): {
    allowed: boolean;
    violations: string[];
};
export declare function checkCoreExperienceCoverage(currentTags: string[], philosophy: RoutePhilosophy): {
    covered: boolean;
    missingTags: string[];
};
