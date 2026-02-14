import { TripContext, TripDayContext, TripPlannerIntent } from '../interfaces/trip-planner.interface';
import { ItineraryGap, ItineraryGapType } from '../interfaces/intent-uncertainty.interface';
export declare class ContextAnalyzerService {
    private readonly logger;
    private readonly config;
    constructor();
    detectGaps(tripContext: TripContext): ItineraryGap[];
    private detectMealGaps;
    private detectActivityGaps;
    private detectTransportGaps;
    private detectHotelGaps;
    analyzeRequestGapRelation(message: string, intent: TripPlannerIntent, gaps: ItineraryGap[]): {
        related: boolean;
        matchedGaps: ItineraryGap[];
        bestMatch?: ItineraryGap;
        confidence: number;
        requestedType?: ItineraryGapType;
    };
    private extractRequestedType;
    private isGapTypeMatch;
    generateDaySummary(day: TripDayContext): string;
    formatGapDescription(gap: ItineraryGap, detailed?: boolean): string;
    private isTimeInWindow;
    private isTimeOverlapping;
    private timeToMinutes;
    private minutesToTime;
    private findActivityBefore;
    private findActivityAfter;
    private generateMealSuggestions;
}
