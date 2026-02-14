import { PrismaService } from '../../../prisma/prisma.service';
import { UpdateChecklistStatusDto, ChecklistStatusResponseDto, GetChecklistStatusResponseDto } from '../dto/checklist-status.dto';
export declare class ChecklistStatusService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    updateChecklistStatus(tripId: string, dto: UpdateChecklistStatusDto): Promise<ChecklistStatusResponseDto>;
    getChecklistStatus(tripId: string): Promise<GetChecklistStatusResponseDto>;
}
