import { PrismaService } from '../../prisma/prisma.service';
import { DayMetricsResponseDto, TripMetricsResponseDto } from '../dto/trip-metrics.dto';
import { TripConflictsService } from './trip-conflicts.service';
export declare class TripMetricsService {
    private prisma;
    private conflictsService;
    private readonly logger;
    constructor(prisma: PrismaService, conflictsService: TripConflictsService);
    getDayMetrics(tripId: string, dayId: string): Promise<DayMetricsResponseDto>;
    getTripMetrics(tripId: string, dates?: string[]): Promise<TripMetricsResponseDto>;
    private calculateDayMetrics;
    private calculateSummary;
    private haversineDistance;
    private toRad;
}
