import { ConfigService } from '@nestjs/config';
import { TestCase } from '../interfaces/evaluation.interface';
export declare class TestCaseManagerService {
    private readonly configService;
    private readonly logger;
    private readonly testCasesDir;
    private testCasesCache;
    constructor(configService: ConfigService);
    loadTestCasesFromFile(component: 'ROUTER' | 'GATE' | 'ITINERARY'): Promise<TestCase[]>;
    getRouterTestCases(): Promise<TestCase[]>;
    getGateTestCases(): Promise<TestCase[]>;
    getItineraryTestCases(): Promise<TestCase[]>;
    addTestCase(testCase: TestCase): Promise<void>;
    private validateTestCase;
    private getDefaultTestCases;
    clearCache(): void;
}
