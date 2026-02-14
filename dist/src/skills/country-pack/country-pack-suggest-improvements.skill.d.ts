import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { ReadinessPack } from '../../trips/readiness/types/readiness-pack.types';
import { ImportCountryPackDto } from '../../route-directions/dto/import-country-pack.dto';
import { CountryPackValidateSkill } from './country-pack-validate.skill';
export interface CountryPackSuggestImprovementsInput extends SkillInput {
    countryCode: string;
    packType: 'readiness' | 'routeDirection';
    currentPackSnapshot: ReadinessPack | ImportCountryPackDto;
}
export interface CountryPackSuggestImprovementsOutput extends SkillOutput {
    missingFields: Array<{
        path: string;
        field: string;
        description: string;
        impact: 'high' | 'medium' | 'low';
    }>;
    qualityGaps: Array<{
        category: string;
        issue: string;
        current: string | number;
        recommended: string | number;
        impact: 'high' | 'medium' | 'low';
    }>;
    priorityTodo: Array<{
        task: string;
        priority: 'high' | 'medium' | 'low';
        estimatedEffort: string;
        impact: string;
        actionableSteps: string[];
    }>;
}
export declare class CountryPackSuggestImprovementsSkill implements Skill<CountryPackSuggestImprovementsInput, CountryPackSuggestImprovementsOutput> {
    private readonly packValidateSkill?;
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "countryPack";
    };
    constructor(packValidateSkill?: CountryPackValidateSkill);
    execute(input: CountryPackSuggestImprovementsInput): Promise<CountryPackSuggestImprovementsOutput>;
    private analyzeMissingFields;
    private determineFieldImpact;
    private analyzeQualityGaps;
    private generatePriorityTodo;
}
