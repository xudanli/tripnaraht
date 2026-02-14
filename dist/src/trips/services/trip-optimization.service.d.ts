import { PrismaService } from '../../prisma/prisma.service';
import { ApplyOptimizationRequestDto, ApplyOptimizationResponseDto } from '../dto/trip-optimization.dto';
import { ItineraryItemsService } from '../../itinerary-items/itinerary-items.service';
export declare class TripOptimizationService {
    private prisma;
    private itineraryItemsService;
    private readonly logger;
    constructor(prisma: PrismaService, itineraryItemsService: ItineraryItemsService);
    applyOptimization(tripId: string, dto: ApplyOptimizationRequestDto): Promise<ApplyOptimizationResponseDto>;
}
