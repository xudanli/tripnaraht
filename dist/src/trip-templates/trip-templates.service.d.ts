import { PrismaService } from '../prisma/prisma.service';
import { GetTripTemplatesQueryDto, TripTemplateResponseDto, CreateTripFromTemplateDto } from './dto/trip-template.dto';
import { TripsService } from '../trips/trips.service';
export declare class TripTemplatesService {
    private prisma;
    private tripsService;
    constructor(prisma: PrismaService, tripsService: TripsService);
    findAll(query: GetTripTemplatesQueryDto): Promise<TripTemplateResponseDto[]>;
    findOne(id: string): Promise<TripTemplateResponseDto>;
    createTripFromTemplate(dto: CreateTripFromTemplateDto, userId: string): Promise<{
        days: any[];
        processedConfig: {
            pacingConfig: import("../trips/interfaces/pacing-config.interface").PacingConfig;
            budgetConfig: {
                totalBudget: number;
                currency: string;
                estimated_flight_visa: number;
                remaining_for_ground: number;
                daily_budget: number;
                hotel_tier_recommendation: string;
                travelers: {
                    type: "ADULT" | "ELDERLY" | "CHILD";
                    mobilityTag: import("../trips/dto/create-trip.dto").MobilityTag;
                }[];
            };
            metadata: Record<string, any>;
        };
        id: string;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        createdAt: Date;
        updatedAt: Date;
        name: string | null;
        status: string | null;
        destination: string;
        startDate: Date;
        endDate: Date;
        budgetConfig: import("@prisma/client/runtime/library").JsonValue | null;
        pacingConfig: import("@prisma/client/runtime/library").JsonValue | null;
    }>;
}
