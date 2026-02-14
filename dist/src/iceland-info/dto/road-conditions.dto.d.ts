export declare enum RoadStatus {
    OPEN = "open",
    CLOSED = "closed",
    CAUTION = "caution",
    IMPASSABLE = "impassable"
}
export declare enum RoadCondition {
    DRY = "dry",
    WET = "wet",
    ICY = "icy",
    SNOW = "snow",
    SLUSHY = "slushy",
    MUDDY = "muddy"
}
export declare class RoadSegmentDto {
    id: string;
    name: string;
    fRoadNumber: string;
    startPoint: {
        lat: number;
        lng: number;
    };
    endPoint: {
        lat: number;
        lng: number;
    };
    status: RoadStatus;
    condition: RoadCondition;
    isOpen: boolean;
    description: string;
    lastUpdated: string;
    expectedOpenTime?: string;
    expectedCloseTime?: string;
}
export declare class RoadConditionsResponseDto {
    fRoads: RoadSegmentDto[];
    lastUpdated: string;
    source: string;
}
export declare class RoadConditionsQueryDto {
    fRoads?: string;
    status?: RoadStatus;
}
