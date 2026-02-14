import { PrismaService } from '../prisma/prisma.service';
import { OptimizeRouteDto } from './dto/optimize-route.dto';
import { RouteOptimizerService } from './services/route-optimizer.service';
export declare class RouteOptimizationService {
    private prisma;
    private optimizerService;
    constructor(prisma: PrismaService, optimizerService: RouteOptimizerService);
    optimizeRoute(dto: OptimizeRouteDto): Promise<import("./interfaces/route-optimization.interface").RouteSolution>;
}
