import { SkillInput } from './skill.interface';
export interface BaseSkillInput extends SkillInput {
    dryRun?: boolean;
}
export declare class BaseSkillInputDto implements BaseSkillInput {
    dryRun?: boolean;
}
