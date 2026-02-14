import { PrismaService } from '../../prisma/prisma.service';
import { POIRouteAffinity, POIAffinityCalculationOptions, POIInfo } from '../interfaces/poi-route-affinity.interface';
import { RouteDirectionData } from '../../route-directions/interfaces/route-direction.interface';
export declare class POIRouteAffinityService {
    private readonly prisma;
    private readonly logger;
    private readonly DEFAULT_WEIGHTS;
    constructor(prisma: PrismaService);
    calculateAffinity(poi: POIInfo, routeDirection: RouteDirectionData & {
        id: number;
    }, options?: POIAffinityCalculationOptions): Promise<POIRouteAffinity>;
    calculateAffinities(pois: POIInfo[], routeDirection: RouteDirectionData & {
        id: number;
    }, options?: POIAffinityCalculationOptions): Promise<POIRouteAffinity[]>;
    private calculateTagMatch;
    private calculateTypeMatch;
    private calculateLocationMatch;
    private calculateObjectiveMatch;
    private calculateExampleBonus;
    private calculateSeasonalityMatch;
    private generateMatchReasons;
    private generateMismatchReasons;
}
