import { PrismaService } from '../../prisma/prisma.service';
import { ConflictDto, ConflictSeverity, ConflictsResponseDto } from '../dto/trip-conflicts.dto';
export declare class TripConflictsService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    getConflicts(tripId: string, date?: string, severity?: ConflictSeverity): Promise<ConflictsResponseDto>;
    getDayConflicts(tripId: string, dayId: string): Promise<ConflictDto[]>;
    private detectDayConflicts;
    private detectLunchWindow;
    private parseClosingTime;
}
