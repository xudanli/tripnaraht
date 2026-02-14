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
        actualCost: number | null;
        costCategory: string | null;
        costNote: string | null;
        currency: string | null;
        estimatedCost: number | null;
        isPaid: boolean;
        paidBy: string | null;
        bookedAt: Date | null;
        bookingConfirmation: string | null;
        bookingStatus: string | null;
        bookingUrl: string | null;
        travelFromPreviousDistance: number | null;
        travelFromPreviousDuration: number | null;
        travelMode: string | null;
        order: number | null;
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
        actualCost: number;
        costCategory: string;
        costNote: string;
        currency: string;
        estimatedCost: number;
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
