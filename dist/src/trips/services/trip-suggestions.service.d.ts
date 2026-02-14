import { PrismaService } from '../../prisma/prisma.service';
import { SuggestionListResponseDto, SuggestionStatsDto, SuggestionPersona, SuggestionScope, SuggestionSeverity, SuggestionStatus, ApplySuggestionRequestDto, ApplySuggestionResponseDto } from '../dto/suggestions.dto';
import { TripsService } from '../trips.service';
import { TripConflictsService } from './trip-conflicts.service';
export declare class TripSuggestionsService {
    private prisma;
    private tripsService;
    private conflictsService;
    private readonly logger;
    private suggestionStatuses;
    constructor(prisma: PrismaService, tripsService: TripsService, conflictsService: TripConflictsService);
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
    applySuggestion(tripId: string, suggestionId: string, request: ApplySuggestionRequestDto): Promise<ApplySuggestionResponseDto>;
    dismissSuggestion(tripId: string, suggestionId: string): Promise<void>;
    private convertPersonaAlertToSuggestion;
    private convertConflictToSuggestions;
    private matchesFilters;
}
