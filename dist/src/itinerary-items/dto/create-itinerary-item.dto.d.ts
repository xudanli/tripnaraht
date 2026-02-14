import { ValidationCode } from '../interfaces/validation.interface';
import { CostCategory } from './item-cost.dto';
export declare enum ItemType {
    ACTIVITY = "ACTIVITY",
    REST = "REST",
    MEAL_ANCHOR = "MEAL_ANCHOR",
    MEAL_FLOATING = "MEAL_FLOATING",
    TRANSIT = "TRANSIT"
}
export declare class CreateItineraryItemDto {
    tripDayId: string;
    placeId?: number;
    trailId?: number;
    type: ItemType;
    startTime: string;
    endTime: string;
    note?: string;
    order?: number;
    estimatedCost?: number;
    actualCost?: number;
    currency?: string;
    costCategory?: CostCategory;
    costNote?: string;
    isPaid?: boolean;
    paidBy?: string;
    forceCreate?: boolean;
    ignoreWarnings?: ValidationCode[];
}
