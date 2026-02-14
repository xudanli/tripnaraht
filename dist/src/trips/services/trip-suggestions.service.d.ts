import { PrismaService } from '../../prisma/prisma.service';
import { SuggestionListResponseDto, SuggestionStatsDto, SuggestionPersona, SuggestionScope, SuggestionSeverity, SuggestionStatus, ApplySuggestionRequestDto, ApplySuggestionResponseDto } from '../dto/suggestions.dto';
import { TripsService } from '../trips.service';
import { TripConflictsService } from './trip-conflicts.service';
import { TripMetricsService } from './trip-metrics.service';
import { ItineraryItemsService } from '../../itinerary-items/itinerary-items.service';
export declare class TripSuggestionsService {
    private prisma;
    private tripsService;
    private conflictsService;
    private tripMetricsService;
    private itineraryItemsService?;
    private readonly logger;
    private suggestionStatuses;
    constructor(prisma: PrismaService, tripsService: TripsService, conflictsService: TripConflictsService, tripMetricsService: TripMetricsService, itineraryItemsService?: ItineraryItemsService);
    getSuggestions(tripId: string, filters?: {
        persona?: SuggestionPersona;
        scope?: SuggestionScope;
        scopeId?: string;
        severity?: SuggestionSeverity;
        status?: SuggestionStatus;
        limit?: number;
        offset?: number;
    }): Promise<SuggestionListResponseDto>;
    getSuggestionStats(tripId: string): Promise<SuggestionStatsDto>;
    private calculateMetricsImpact;
    private getCurrentTripMetrics;
    applyHighPrioritySuggestions(tripId: string, options?: {
        preview?: boolean;
        limit?: number;
    }): Promise<{
        success: boolean;
        appliedCount: number;
        suggestions: Array<{
            id: string;
            title: string;
            severity: SuggestionSeverity;
            applied: boolean;
            error?: string;
        }>;
        impact?: ApplySuggestionResponseDto['impact'];
    }>;
    private estimateImpactBySuggestionType;
    applySuggestion(tripId: string, suggestionId: string, request: ApplySuggestionRequestDto): Promise<ApplySuggestionResponseDto>;
    dismissSuggestion(tripId: string, suggestionId: string): Promise<void>;
    private convertPersonaAlertToSuggestion;
    private convertConflictToSuggestions;
    private matchesFilters;
}
