import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { RoutePack } from './route-pack-new-skeleton.skill';
export interface RoutePackGenerateRegressionTestsInput extends SkillInput {
    pack: RoutePack;
    testScenarios?: Array<{
        name: string;
        context: {
            countryCode: string;
            season?: number;
            userProfile?: {
                pacePreference?: 'SLOW' | 'MEDIUM' | 'FAST';
                altitudeTolerance?: 'LOW' | 'MEDIUM' | 'HIGH';
                riskTolerance?: 'LOW' | 'MEDIUM' | 'HIGH';
            };
        };
        expectedOutcomes?: string[];
    }>;
}
export interface RoutePackGenerateRegressionTestsOutput extends SkillOutput {
    tests: Array<{
        id: string;
        name: string;
        description: string;
        type: 'routePack';
        input: any;
        expectedOutput?: any;
        assertions: Array<{
            type: string;
            description: string;
            check: string;
        }>;
    }>;
    summary: {
        totalTests: number;
        testTypes: Record<string, number>;
    };
}
export declare class RoutePackGenerateRegressionTestsSkill implements Skill<RoutePackGenerateRegressionTestsInput, RoutePackGenerateRegressionTestsOutput> {
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "countryPack";
    };
    execute(input: RoutePackGenerateRegressionTestsInput): Promise<RoutePackGenerateRegressionTestsOutput>;
}
