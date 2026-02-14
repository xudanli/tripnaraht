import { PrismaService } from '../../prisma/prisma.service';
export declare class FlightPriceDetailService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    estimateDomesticPrice(originCity: string, destinationCity: string, month: number, dayOfWeek?: number): Promise<{
        estimatedPrice: number;
        lowerBound: number;
        upperBound: number;
        monthlyBasePrice: number;
        dayOfWeekFactor?: number;
        sampleCount: number;
        distanceKm?: number | null;
        monthFactor?: number | null;
        airlineCount?: number | null;
        isWeekend?: boolean | null;
        departureTime?: string | null;
        arrivalTime?: string | null;
        timeOfDayFactor?: number | null;
    }>;
    getDayOfWeekFactor(dayOfWeek: number): Promise<number>;
    getAllDayOfWeekFactors(): Promise<{
        factor: number;
        id: number;
        updatedAt: Date;
        avgPrice: number | null;
        sampleCount: number;
        lastUpdated: Date;
        dayOfWeek: number;
        totalAvgPrice: number | null;
    }[]>;
    getMonthlyTrend(originCity: string, destinationCity: string): Promise<Array<{
        month: number;
        basePrice: number;
        sampleCount: number;
    }>>;
}
