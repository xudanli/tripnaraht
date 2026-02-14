import { PrismaService } from '../../../prisma/prisma.service';
import { E2ECase } from './e2e-case.types';
export declare class E2ECaseStorageService {
    private readonly prisma;
    private readonly logger;
    private readonly casesDir;
    constructor(prisma: PrismaService);
    loadCaseFromFile(caseId: string): Promise<E2ECase | null>;
    loadCaseFromDatabase(caseId: string): Promise<E2ECase | null>;
    loadCase(caseId: string): Promise<E2ECase | null>;
    private loadCaseFromExamples;
    saveCase(testCase: E2ECase): Promise<void>;
    listCases(): Promise<string[]>;
}
