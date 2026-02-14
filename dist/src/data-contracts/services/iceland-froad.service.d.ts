import { FRoadInfo, RouteRiskAssessment, CarRentalInsurance } from '../interfaces/iceland-specific.interface';
export declare class IcelandFRoadService {
    private readonly logger;
    private readonly fRoadPattern;
    isFRoad(roadNumber: string): boolean;
    extractFRoadFromTags(tags: Record<string, any>): FRoadInfo | null;
    assessRouteRisk(routeSegments: Array<{
        roadNumber?: string;
        roadType?: string;
        isGravel?: boolean;
    }>, vehicleType?: '2WD' | '4WD', insurance?: CarRentalInsurance[]): RouteRiskAssessment;
    isVehicleSuitableForRoute(vehicleType: '2WD' | '4WD', routeSegments: Array<{
        roadNumber?: string;
    }>): {
        suitable: boolean;
        reason?: string;
    };
    private parseDifficultyLevel;
}
