import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { ReadinessPack } from '../../trips/readiness/types/readiness-pack.types';
import { ImportCountryPackDto } from '../../route-directions/dto/import-country-pack.dto';
import { TripContext } from '../../trips/readiness/types/trip-context.types';
export interface CountryPackGenerateRegressionTestsInput extends SkillInput {
    pack: ReadinessPack | ImportCountryPackDto;
    packType: 'readiness' | 'routeDirection';
    testScenarios?: Array<{
        name: string;
        context: Partial<TripContext>;
        expectedOutcomes?: string[];
    }>;
}
export interface CountryPackGenerateRegressionTestsOutput extends SkillOutput {
    tests: Array<{
        id: string;
        name: string;
        description: string;
        type: 'readiness' | 'routeDirection';
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
export declare class CountryPackGenerateRegressionTestsSkill implements Skill<CountryPackGenerateRegressionTestsInput, CountryPackGenerateRegressionTestsOutput> {
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "countryPack";
    };
    execute(input: CountryPackGenerateRegressionTestsInput): Promise<CountryPackGenerateRegressionTestsOutput>;
    private generateReadinessPackTests;
    private generateRouteDirectionPackTests;
    private buildTestContext;
}
