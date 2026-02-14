import { PrismaService } from '../../prisma/prisma.service';
import { ItemType } from '../dto/create-itinerary-item.dto';
import { CostCategory, ItemCostDto, BatchUpdateCostDto, TripCostSummaryDto, BatchUpdateCostResultDto } from '../dto/item-cost.dto';
export declare class ItemCostService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    getDefaultCostCategory(itemType: ItemType): CostCategory;
    updateItemCost(itemId: string, costData: ItemCostDto): Promise<{
        Place: {
            id: number;
            nameEN: string;
            category: import(".prisma/client").$Enums.PlaceCategory;
            nameCN: string;
        };
    } & {
        id: string;
        type: import(".prisma/client").$Enums.ItemType;
        placeId: number | null;
        startTime: Date | null;
        endTime: Date | null;
        tripDayId: string;
        note: string | null;
        trailId: number | null;
        order: number | null;
        estimatedCost: number | null;
        actualCost: number | null;
        currency: string | null;
        costCategory: string | null;
        costNote: string | null;
        isPaid: boolean;
        paidBy: string | null;
        travelFromPreviousDuration: number | null;
        travelFromPreviousDistance: number | null;
        travelMode: string | null;
        bookingStatus: string | null;
        bookingConfirmation: string | null;
        bookingUrl: string | null;
        bookedAt: Date | null;
    }>;
    batchUpdateCost(dto: BatchUpdateCostDto): Promise<BatchUpdateCostResultDto>;
    getTripCostSummary(tripId: string): Promise<TripCostSummaryDto>;
    getItemCost(itemId: string): Promise<{
        id: string;
        Place: {
            nameEN: string;
            nameCN: string;
        };
        type: import(".prisma/client").$Enums.ItemType;
        estimatedCost: number;
        actualCost: number;
        currency: string;
        costCategory: string;
        costNote: string;
        isPaid: boolean;
        paidBy: string;
    }>;
    getUnpaidItems(tripId: string): Promise<{
        id: string;
        placeName: string;
        date: string;
        estimatedCost: number;
        actualCost: number;
        currency: string;
        costCategory: string;
        costNote: string;
    }[]>;
}
