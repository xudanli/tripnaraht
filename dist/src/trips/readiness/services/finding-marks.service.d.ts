import { PrismaService } from '../../../prisma/prisma.service';
import { MarkNotApplicableDto, MarkNotApplicableResponseDto, AddToLaterDto, AddToLaterResponseDto, GetNotApplicableResponseDto, GetLaterResponseDto } from '../dto/finding-mark.dto';
export declare class FindingMarksService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    markNotApplicable(tripId: string, findingId: string, dto: MarkNotApplicableDto): Promise<MarkNotApplicableResponseDto>;
    unmarkNotApplicable(tripId: string, findingId: string): Promise<{
        findingId: string;
        marked: boolean;
    }>;
    getNotApplicableItems(tripId: string): Promise<GetNotApplicableResponseDto>;
    addToLater(tripId: string, findingId: string, dto: AddToLaterDto): Promise<AddToLaterResponseDto>;
    removeFromLater(tripId: string, findingId: string): Promise<{
        findingId: string;
        removed: boolean;
    }>;
    getLaterItems(tripId: string): Promise<GetLaterResponseDto>;
}
