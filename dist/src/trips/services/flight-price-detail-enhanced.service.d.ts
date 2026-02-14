import { PrismaService } from '../../prisma/prisma.service';
export declare class FlightPriceDetailEnhancedService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    getDetailedPriceOptions(originCity: string, destinationCity: string, month: number, dayOfWeek?: number): Promise<{
        airlines: Array<{
            airline: string;
            avgPrice: number;
            minPrice: number;
            maxPrice: number;
            sampleCount: number;
            departureTimes: Array<{
                timeSlot: string;
                avgPrice: number;
                sampleCount: number;
            }>;
        }>;
        timeSlots: Array<{
            timeSlot: string;
            avgPrice: number;
            minPrice: number;
            maxPrice: number;
            sampleCount: number;
            airlines: string[];
        }>;
    }>;
}
