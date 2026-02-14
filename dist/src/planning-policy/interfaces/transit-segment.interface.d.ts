export type TransitMode = 'WALK' | 'BUS' | 'SUBWAY' | 'TAXI' | 'TRAIN' | 'FERRY';
export interface TransitSegment {
    mode: TransitMode;
    durationMin: number;
    walkMin: number;
    transferCount: number;
    stairsCount?: number;
    elevatorAvailable?: boolean;
    wheelchairAccessible?: boolean;
    crowdLevel?: 0 | 1 | 2 | 3;
    reliability?: number;
    costCny?: number;
}
