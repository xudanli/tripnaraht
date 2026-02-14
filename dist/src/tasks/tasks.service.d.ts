import { PrismaService } from '../prisma/prisma.service';
export declare class TasksService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    updateExchangeRates(): Promise<void>;
}
