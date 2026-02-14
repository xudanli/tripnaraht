import { SecurityRedTeamTestCase, SecurityRedTeamTestResult } from '../interfaces/safety-compliance.interface';
import { ConstraintsEngineService } from './constraints-engine.service';
export declare class SecurityRedTeamService {
    private readonly constraintsEngine;
    private readonly logger;
    private readonly testCases;
    constructor(constraintsEngine: ConstraintsEngineService);
    createTestCase(testCase: Omit<SecurityRedTeamTestCase, 'test_id'>): SecurityRedTeamTestCase;
    runRedTeamTests(testCaseIds?: string[]): Promise<SecurityRedTeamTestResult[]>;
    private initializeTestCases;
    getTestCase(testId: string): SecurityRedTeamTestCase | undefined;
    listTestCases(category?: SecurityRedTeamTestCase['category']): SecurityRedTeamTestCase[];
}
