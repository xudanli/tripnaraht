import { RouteDirectionRecommendation } from '../services/route-direction-selector.service';
import { TripPlan } from '../../trips/decision/plan-model';
export type TransportMode = 'ferry' | 'boat' | 'flight' | 'rail' | 'bus' | 'drive';
export interface TransportBookingReminder {
    mode: TransportMode;
    title: string;
    description: string;
    urgency: 'low' | 'medium' | 'high' | 'critical';
    timeWindow: {
        recommendedDaysAhead: number;
        bookingDeadline?: string;
        seasonality?: {
            peakMonths?: number[];
            offPeakMonths?: number[];
        };
    };
    bookingInfo?: {
        operator?: string;
        bookingLink?: string;
        estimatedCost?: {
            min: number;
            max: number;
            currency: string;
        };
        frequency?: string;
        duration?: string;
    };
    alternativeStrategies?: TransportAlternativeStrategy[];
}
export interface TransportAlternativeStrategy {
    strategy: 'replace_mode' | 'replace_activity' | 'adjust_schedule' | 'split_day';
    description: string;
    impact: 'low' | 'medium' | 'high';
    feasibility: 'easy' | 'moderate' | 'difficult';
    details?: {
        alternativeMode?: TransportMode;
        alternativeActivity?: string;
        scheduleAdjustment?: string;
    };
}
export interface TransportChecklist {
    reminders: TransportBookingReminder[];
    summary: {
        totalReminders: number;
        criticalReminders: number;
        estimatedBookingDaysAhead: number;
        unavailableModes?: TransportMode[];
    };
    alternativeStrategies: TransportAlternativeStrategy[];
    neptuneActions?: {
        action: 'REPLACE_MODE' | 'REPLACE_ACTIVITY' | 'ADJUST_SCHEDULE' | 'SPLIT_DAY';
        reason: string;
        details: any;
    }[];
}
export declare class TransportPluginService {
    private readonly logger;
    generateChecklist(routeDirection: RouteDirectionRecommendation, itineraryDraft?: TripPlan, availableModes?: TransportMode[], userBookingStatus?: {
        ferryBooked?: boolean;
        flightBooked?: boolean;
        railBooked?: boolean;
    }): TransportChecklist;
    private createBookingReminder;
    private generateAlternativeStrategies;
    private generateNeptuneActions;
    private checkBookingStatus;
    private getModeConfig;
    private getAlternativeMode;
    private getAlternativeActivity;
    private getModeName;
}
