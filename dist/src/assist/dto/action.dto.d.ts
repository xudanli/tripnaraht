export type AssistantAction = {
    type: 'QUERY_NEXT_STOP';
} | {
    type: 'MOVE_POI_TO_MORNING';
    poiId?: string;
    poiName?: string;
    preferredRange?: 'AM' | 'PM';
    rebuildTimeline?: boolean;
} | {
    type: 'ADD_POI_TO_SCHEDULE';
    poiId: string;
    preferredRange?: 'AM' | 'PM';
    insertAfterStopId?: string;
};
export interface AssistantSuggestion {
    id: string;
    title: string;
    description?: string;
    confidence: 'LOW' | 'MEDIUM' | 'HIGH';
    action?: AssistantAction;
    clarification?: {
        question: string;
        options?: Array<{
            label: string;
            value: string;
        }>;
    };
    poiInfo?: {
        id: string;
        name: string;
        lat: number;
        lng: number;
        distanceM?: number;
        rating?: number;
        isOpenNow?: boolean;
    };
}
export interface PoiCandidate {
    id: string;
    name: string;
    nameCN?: string;
    nameEN?: string;
    lat: number;
    lng: number;
    distanceM?: number;
    rating?: number;
    isOpenNow?: boolean;
    address?: string;
    tags?: string[];
    matchScore?: number;
}
