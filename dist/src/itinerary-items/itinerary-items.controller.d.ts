import { ItineraryItemsService } from './itinerary-items.service';
import { ItineraryValidationService } from './services/itinerary-validation.service';
import { ItemCostService } from './services/item-cost.service';
import { CreateItineraryItemDto } from './dto/create-itinerary-item.dto';
import { UpdateItineraryItemDto } from './dto/update-itinerary-item.dto';
import { ItemCostDto, BatchUpdateCostDto } from './dto/item-cost.dto';
export declare class ItineraryItemsController {
    private readonly itineraryItemsService;
    private readonly validationService;
    private readonly itemCostService;
    private readonly logger;
    constructor(itineraryItemsService: ItineraryItemsService, validationService: ItineraryValidationService, itemCostService: ItemCostService);
    validate(dto: CreateItineraryItemDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    batchValidate(tripId: string, body: {
        dates?: string[];
    }): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    create(dto: CreateItineraryItemDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any> | {
        success: boolean;
        error: {
            code: string;
            message: string;
            requiresConfirmation: boolean;
        };
        warnings: import("./interfaces/validation.interface").ValidationResult[];
        travelInfo: import("./interfaces/validation.interface").TravelInfo;
    }>;
    findAll(tripDayId?: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any[]>>;
    searchNearbyPoi(itemId?: string, lat?: string, lng?: string, radius?: string, categories?: string, minRating?: string, openNow?: string, limit?: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    findOne(id: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    update(id: string, dto: UpdateItineraryItemDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any> | {
        success: boolean;
        error: {
            code: string;
            message: string;
            requiresConfirmation: boolean;
        };
        warnings: import("./interfaces/validation.interface").ValidationResult[];
        cascadeImpact: import("./interfaces/validation.interface").CascadeImpact;
        travelInfo: import("./interfaces/validation.interface").TravelInfo;
    }>;
    remove(id: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getItemCost(id: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    updateItemCost(id: string, dto: ItemCostDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    batchUpdateCost(dto: BatchUpdateCostDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getTripCostSummary(tripId: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getUnpaidItems(tripId: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    fixItemDates(tripId: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    calculateAllTravelInfo(tripId: string, body: {
        defaultTravelMode?: 'DRIVING' | 'WALKING' | 'TRANSIT';
    }): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    calculateTravelInfo(tripId: string, dayId: string, body: {
        defaultTravelMode?: 'DRIVING' | 'WALKING' | 'TRANSIT';
    }): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getDayTravelInfo(tripId: string, dayId: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    updateBookingStatus(id: string, body: {
        bookingStatus?: 'BOOKED' | 'NEED_BOOKING' | 'NO_BOOKING';
        bookingConfirmation?: string;
        bookingUrl?: string;
        bookedAt?: string;
    }): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    updateTravelInfo(id: string, body: {
        travelFromPreviousDuration?: number;
        travelFromPreviousDistance?: number;
        travelMode?: 'DRIVING' | 'WALKING' | 'TRANSIT';
    }): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
}
