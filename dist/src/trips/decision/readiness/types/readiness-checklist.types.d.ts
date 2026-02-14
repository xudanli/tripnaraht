export type ReadinessChecklistItemType = 'GEAR' | 'DOCUMENT' | 'HEALTH' | 'SKILL';
export type ReadinessSeverity = 'MUST' | 'SHOULD' | 'OPTIONAL';
export interface TravelReadinessChecklistItem {
    id: string;
    type: ReadinessChecklistItemType;
    severity: ReadinessSeverity;
    title: string;
    description: string;
    reasonSignals: string[];
    metadata?: Record<string, any>;
}
export interface TravelReadinessResult {
    routeId?: string;
    summary: string;
    items: TravelReadinessChecklistItem[];
    itemsByType: {
        GEAR: TravelReadinessChecklistItem[];
        DOCUMENT: TravelReadinessChecklistItem[];
        HEALTH: TravelReadinessChecklistItem[];
        SKILL: TravelReadinessChecklistItem[];
    };
    itemsBySeverity: {
        MUST: TravelReadinessChecklistItem[];
        SHOULD: TravelReadinessChecklistItem[];
        OPTIONAL: TravelReadinessChecklistItem[];
    };
}
