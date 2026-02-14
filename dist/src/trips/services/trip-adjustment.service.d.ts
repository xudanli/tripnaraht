import { PrismaService } from '../../prisma/prisma.service';
import { TripDecisionEngineService } from '../decision/trip-decision-engine.service';
import { ItineraryItemsService } from '../../itinerary-items/itinerary-items.service';
export interface TripModificationRequest {
    tripId: string;
    modifications: Array<{
        type: 'CHANGE_DATE' | 'MOVE_ACTIVITY' | 'ADD_ACTIVITY' | 'REMOVE_ACTIVITY' | 'ADD_BUFFERS';
        itemId?: string;
        newDate?: string;
        newStartTime?: string;
        activityData?: any;
        options?: {
            bufferDuration?: number;
            applyToAllDays?: boolean;
            dayId?: string;
        };
    }>;
}
export interface TripAdjustmentResult {
    success: boolean;
    adjustedTrip: any;
    changes: Array<{
        type: string;
        description: string;
        affectedItems: string[];
    }>;
    budgetUpdate?: {
        oldBudget: number;
        newBudget: number;
        changes: string[];
    };
    notifications: Array<{
        type: 'HOTEL' | 'TRANSPORT' | 'ACTIVITY';
        message: string;
        actionRequired: boolean;
    }>;
}
export declare class TripAdjustmentService {
    private prisma;
    private decisionEngine;
    private itineraryItemsService;
    private readonly logger;
    constructor(prisma: PrismaService, decisionEngine: TripDecisionEngineService, itineraryItemsService: ItineraryItemsService);
    adjustTrip(request: TripModificationRequest): Promise<TripAdjustmentResult>;
    private handleDateChange;
    private handleMoveActivity;
    private handleAddActivity;
    private handleRemoveActivity;
    private handleAddBuffers;
    private triggerPacingAdjustment;
    private recalculateBudget;
}
