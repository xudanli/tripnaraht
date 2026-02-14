export interface SplitOperation {
    type: 'SPLIT_DAY';
    dayIndex: number;
    splitAfterSegmentIndex: number;
}
export interface BufferDayOperation {
    type: 'INSERT_BUFFER_DAY';
    insertAfterDayIndex: number;
    template?: 'REST' | 'LIGHT_WALK' | 'LOCAL_EXPLORE';
}
export type DrDreOperation = SplitOperation | BufferDayOperation;
