import { PrismaService } from '../../prisma/prisma.service';
import { TripInsightResponseDto } from '../dto/trip-insight.dto';
export declare class TripInsightService {
    private readonly prisma;
    private readonly logger;
    private readonly MAX_PLACES_PER_DAY;
    private readonly WARNING_PLACES_PER_DAY;
    constructor(prisma: PrismaService);
    getInsight(tripId: string): Promise<TripInsightResponseDto>;
    private buildTripSummary;
    private getDestinationName;
    private generateFindings;
    private checkRouteOptimization;
    private checkPacing;
    private getReadinessSummary;
    private estimateReadiness;
    private calculateOverallStatus;
}
