export declare enum CostCategory {
    ACCOMMODATION = "ACCOMMODATION",
    TRANSPORTATION = "TRANSPORTATION",
    FOOD = "FOOD",
    ACTIVITIES = "ACTIVITIES",
    SHOPPING = "SHOPPING",
    OTHER = "OTHER"
}
export declare class ItemCostDto {
    estimatedCost?: number;
    actualCost?: number;
    currency?: string;
    costCategory?: CostCategory;
    costNote?: string;
    isPaid?: boolean;
    paidBy?: string;
}
export declare class BatchUpdateCostItemDto {
    id: string;
    actualCost?: number;
    isPaid?: boolean;
    costNote?: string;
}
export declare class BatchUpdateCostDto {
    tripId: string;
    items: BatchUpdateCostItemDto[];
}
export declare class CategoryCostSummaryDto {
    estimated: number;
    actual: number;
    count: number;
}
export declare class DailyCostSummaryDto {
    date: string;
    estimated: number;
    actual: number;
    itemCount: number;
}
export declare class CostVarianceDto {
    amount: number;
    percentage: number;
    status: 'UNDER_BUDGET' | 'ON_BUDGET' | 'OVER_BUDGET';
}
export declare class TripCostSummaryDto {
    totalBudget: number;
    totalEstimated: number;
    totalActual: number;
    totalPaid: number;
    totalUnpaid: number;
    currency: string;
    byCategory: Record<string, CategoryCostSummaryDto>;
    byDay: DailyCostSummaryDto[];
    variance: CostVarianceDto;
    budgetUsagePercent: number;
}
export declare class BatchUpdateCostResultDto {
    updated: number;
    failed: number;
    failedIds?: string[];
}
