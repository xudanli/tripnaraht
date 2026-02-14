import { PrismaService } from '../../prisma/prisma.service';
import { UpdateIntentRequestDto, UpdateIntentResponseDto, IntentResponseDto } from '../dto/trip-intent.dto';
export declare class TripIntentService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    updateIntent(tripId: string, dto: UpdateIntentRequestDto): Promise<UpdateIntentResponseDto>;
    getIntent(tripId: string): Promise<IntentResponseDto>;
}
