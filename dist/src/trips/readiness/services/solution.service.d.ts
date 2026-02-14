import { PrismaService } from '../../../prisma/prisma.service';
import { GetSolutionsResponseDto } from '../dto/solution.dto';
export declare class SolutionService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    getSolutions(tripId: string, blockerId: string): Promise<GetSolutionsResponseDto>;
    private generateSolutionsForBlocker;
    private getBlockerMessage;
}
