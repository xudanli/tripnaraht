export declare class PlaceNodeDto {
    id: number;
    name: string;
    intensity?: 'LOW' | 'MEDIUM' | 'HIGH';
    estimatedDuration?: number;
    timeWindow?: {
        earliest: string;
        latest: string;
    };
    serviceTime?: number;
    isRestaurant?: boolean;
}
export declare class OptimizationConfigDto {
    date: string;
    startTime: string;
    endTime: string;
    pacingFactor?: number;
    hasChildren?: boolean;
    hasElderly?: boolean;
    lunchWindow?: {
        start: string;
        end: string;
    };
    dinnerWindow?: {
        start: string;
        end: string;
    };
    useVRPTW?: boolean;
}
export declare class OptimizeRouteDto {
    placeIds: number[];
    config: OptimizationConfigDto;
}
