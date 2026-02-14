import { PrismaService } from '../../prisma/prisma.service';
import { LlmService } from '../../llm/services/llm.service';
import { CreateTripDraftDto, TripDraftResponseDto, ReplaceItineraryItemDto, ReplaceItineraryItemResponseDto, RegenerateTripDto, RegenerateTripResponseDto, SaveTripDraftDto } from '../dto/trip-draft.dto';
export declare class TripDraftService {
    private prisma;
    private llmService;
    private readonly logger;
    private readonly SLOT_TIMES;
    constructor(prisma: PrismaService, llmService: LlmService);
    generateDraft(dto: CreateTripDraftDto, onProgress?: (progress: {
        status: 'generating' | 'completed' | 'failed';
        stage: string;
        message: string;
        itemsCount?: number;
    }) => Promise<void>): Promise<TripDraftResponseDto>;
    private retrieveCandidates;
    private retrieveCandidatesByCity;
    private getCategoryFilterByStyle;
    private buildDayList;
    private llmOrchestrate;
    private buildOrchestrationPrompt;
    private validateAndRepair;
    private fillMissingSlots;
    private formatOpeningHours;
    private getOpeningHoursForDate;
    saveDraftAsTrip(dto: SaveTripDraftDto): Promise<{
        id: string;
        destination: string;
        startDate: string;
        endDate: string;
    }>;
    createItineraryItemsFromDraft(tripId: string, draft: TripDraftResponseDto, userEdits?: SaveTripDraftDto['userEdits']): Promise<number>;
    replaceItem(tripId: string, itemId: string, dto: ReplaceItineraryItemDto): Promise<ReplaceItineraryItemResponseDto>;
    regenerateTrip(tripId: string, dto: RegenerateTripDto): Promise<RegenerateTripResponseDto>;
    private extractJSON;
}
