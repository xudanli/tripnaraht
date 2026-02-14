import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { RoutePack } from './route-pack-new-skeleton.skill';
export interface RoutePackValidateInput extends SkillInput {
    pack: RoutePack;
}
export interface RoutePackValidateOutput extends SkillOutput {
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
export declare class RoutePackValidateSkill implements Skill<RoutePackValidateInput, RoutePackValidateOutput> {
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "countryPack";
    };
    constructor();
    execute(input: RoutePackValidateInput): Promise<RoutePackValidateOutput>;
}
