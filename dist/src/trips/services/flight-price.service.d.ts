import { PrismaService } from '../../prisma/prisma.service';
export declare class FlightPriceService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    getEstimatedCost(countryCode: string, originCity?: string, useConservative?: boolean): Promise<number>;
    getPriceDetails(countryCode: string, originCity?: string): Promise<{
        flightPrice: {
            lowSeason: number;
            highSeason: number;
            average: number;
        };
        visaCost: number;
        total: {
            conservative: number;
            average: number;
        };
        source?: string;
        lastUpdated?: Date;
    } | null>;
    findAll(): Promise<{
        id: number;
        createdAt: Date;
        updatedAt: Date;
        source: string | null;
        countryCode: string;
        notes: string | null;
        originCity: string | null;
        lowSeasonPrice: number;
        highSeasonPrice: number;
        averagePrice: number;
        visaCost: number;
        lastUpdated: Date;
    }[]>;
    findOne(id: number): Promise<{
        id: number;
        createdAt: Date;
        updatedAt: Date;
        source: string | null;
        countryCode: string;
        notes: string | null;
        originCity: string | null;
        lowSeasonPrice: number;
        highSeasonPrice: number;
        averagePrice: number;
        visaCost: number;
        lastUpdated: Date;
    }>;
    create(data: {
        countryCode: string;
        originCity?: string | null;
        lowSeasonPrice: number;
        highSeasonPrice: number;
        visaCost?: number;
        source?: string;
        notes?: string;
    }): Promise<{
        id: number;
        createdAt: Date;
        updatedAt: Date;
        source: string | null;
        countryCode: string;
        notes: string | null;
        originCity: string | null;
        lowSeasonPrice: number;
        highSeasonPrice: number;
        averagePrice: number;
        visaCost: number;
        lastUpdated: Date;
    }>;
    update(id: number, data: {
        countryCode?: string;
        originCity?: string | null;
        lowSeasonPrice?: number;
        highSeasonPrice?: number;
        visaCost?: number;
        source?: string;
        notes?: string;
    }): Promise<{
        id: number;
        createdAt: Date;
        updatedAt: Date;
        source: string | null;
        countryCode: string;
        notes: string | null;
        originCity: string | null;
        lowSeasonPrice: number;
        highSeasonPrice: number;
        averagePrice: number;
        visaCost: number;
        lastUpdated: Date;
    }>;
    remove(id: number): Promise<{
        id: number;
        createdAt: Date;
        updatedAt: Date;
        source: string | null;
        countryCode: string;
        notes: string | null;
        originCity: string | null;
        lowSeasonPrice: number;
        highSeasonPrice: number;
        averagePrice: number;
        visaCost: number;
        lastUpdated: Date;
    }>;
}
