import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { ReadinessPack, SeasonType } from '../../trips/readiness/types/readiness-pack.types';
import { ImportCountryPackDto } from '../../route-directions/dto/import-country-pack.dto';
import { ExaIntegrationService } from '../../mcp/exa-integration.service';
export interface CountryPackNewSkeletonInput extends SkillInput {
    countryCode: string;
    countryName: string;
    countryNameCN?: string;
    packType: 'readiness' | 'routeDirection';
    regions?: string[];
    supportedSeasons?: SeasonType[];
}
export interface CountryPackNewSkeletonOutput extends SkillOutput {
    skeleton: ReadinessPack | ImportCountryPackDto;
    template: {
        type: string;
        description: string;
        requiredFields: string[];
        optionalFields: string[];
    };
}
export declare class CountryPackNewSkeletonSkill implements Skill<CountryPackNewSkeletonInput, CountryPackNewSkeletonOutput> {
    private readonly exaIntegration?;
    private readonly logger;
    constructor(exaIntegration?: ExaIntegrationService);
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "countryPack";
    };
    execute(input: CountryPackNewSkeletonInput): Promise<CountryPackNewSkeletonOutput>;
    private createReadinessPackSkeleton;
    private createRouteDirectionPackSkeleton;
}
