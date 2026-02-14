import { PrismaService } from '../../prisma/prisma.service';
import { AggregatedValidationResult, CascadeImpact, BatchValidationResult } from '../interfaces/validation.interface';
import { CreateItineraryItemDto } from '../dto/create-itinerary-item.dto';
import { TimeOverlapValidator } from '../validators/time-overlap.validator';
import { TravelTimeValidator } from '../validators/travel-time.validator';
import { BufferTimeValidator } from '../validators/buffer-time.validator';
export declare class ItineraryValidationService {
    private readonly prisma;
    private readonly timeOverlapValidator;
    private readonly travelTimeValidator;
    private readonly bufferTimeValidator;
    private readonly logger;
    private readonly validators;
    constructor(prisma: PrismaService, timeOverlapValidator: TimeOverlapValidator, travelTimeValidator: TravelTimeValidator, bufferTimeValidator: BufferTimeValidator);
    validateCreate(dto: CreateItineraryItemDto): Promise<AggregatedValidationResult>;
    validateUpdate(itemId: string, dto: Partial<CreateItineraryItemDto>, options?: {
        detectCascadeImpact?: boolean;
    }): Promise<AggregatedValidationResult & {
        cascadeImpact?: CascadeImpact;
    }>;
    validateBatch(tripId: string, dates?: string[]): Promise<BatchValidationResult>;
    private buildContext;
    private buildContextForUpdate;
    private toContextItem;
    private aggregateResults;
    private detectCascadeImpact;
    private estimateTravelTime;
    private calculateHaversineDistance;
    private toRad;
    private formatTimeDelta;
    private extractCoordinates;
}
