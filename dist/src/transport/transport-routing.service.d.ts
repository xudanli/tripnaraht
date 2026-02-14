import { PrismaService } from '../prisma/prisma.service';
import { UserContext, TransportRecommendation } from './interfaces/transport.interface';
import { TransportDecisionService } from './transport-decision.service';
import { SmartRoutesService } from './services/smart-routes.service';
import { RouteCacheService } from './services/route-cache.service';
export declare class TransportRoutingService {
    private prisma;
    private decisionService;
    private smartRoutesService;
    private routeCacheService;
    private readonly logger;
    constructor(prisma: PrismaService, decisionService: TransportDecisionService, smartRoutesService: SmartRoutesService, routeCacheService: RouteCacheService);
    planRoute(fromLat: number, fromLng: number, toLat: number, toLng: number, context: UserContext): Promise<TransportRecommendation>;
    private planInterCityRoute;
    private planIntraCityRoute;
    private calculateDistance;
    private toRadians;
    private estimateRailTime;
    private estimateRailCost;
    private estimateBusTime;
    private estimateBusCost;
    private estimateFlightTime;
    private estimateFlightCost;
    private estimateTransitTime;
    private estimateTransitCost;
    private estimateTransfers;
    private estimateTaxiTime;
    private estimateTaxiCost;
}
