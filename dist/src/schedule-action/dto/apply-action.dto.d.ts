export declare class ActionQueryNextStopDto {
    type: 'QUERY_NEXT_STOP';
}
export declare class ActionMovePoiToMorningDto {
    type: 'MOVE_POI_TO_MORNING';
    poiId?: string;
    poiName?: string;
    preferredRange?: 'AM' | 'PM';
    rebuildTimeline?: boolean;
}
export declare class ActionAddPoiToScheduleDto {
    type: 'ADD_POI_TO_SCHEDULE';
    poiId: string;
    preferredRange?: 'AM' | 'PM';
    insertAfterStopId?: string;
}
export declare class ApplyActionRequestDto {
    schedule: any;
    action: ActionQueryNextStopDto | ActionMovePoiToMorningDto | ActionAddPoiToScheduleDto;
}
