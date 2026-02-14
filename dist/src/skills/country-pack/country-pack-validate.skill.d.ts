import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { PackValidatorService } from '../../trips/readiness/storage/pack-validator.service';
import { ReadinessPack } from '../../trips/readiness/types/readiness-pack.types';
import { ImportCountryPackDto } from '../../route-directions/dto/import-country-pack.dto';
import { RouteDirectionsService } from '../../route-directions/route-directions.service';
export interface CountryPackValidateInput extends SkillInput {
    pack: ReadinessPack | ImportCountryPackDto;
    packType: 'readiness' | 'routeDirection';
}
export interface CountryPackValidateOutput extends SkillOutput {
    valid: boolean;
    errors: Array<{
        path: string;
        message: string;
        code: string;
    }>;
    warnings: Array<{
        path: string;
        message: string;
        code: string;
    }>;
    summary: {
        totalErrors: number;
        totalWarnings: number;
        criticalIssues: string[];
    };
}
export declare class CountryPackValidateSkill implements Skill<CountryPackValidateInput, CountryPackValidateOutput> {
    private readonly packValidator?;
    private readonly routeDirectionsService?;
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "countryPack";
    };
    constructor(packValidator?: PackValidatorService, routeDirectionsService?: RouteDirectionsService);
    execute(input: CountryPackValidateInput): Promise<CountryPackValidateOutput>;
    private validateReadinessPack;
    private validateRouteDirectionPack;
    private basicValidateReadinessPack;
}
