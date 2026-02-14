import 'reflect-metadata';
import { SkillMetadata } from '../interfaces/skill.interface';
export declare const SKILL_METADATA_KEY: unique symbol;
export declare const SKILL_CLASS_KEY: unique symbol;
export interface SkillDecoratorOptions extends SkillMetadata {
}
export declare function Skill(options: SkillDecoratorOptions): <T extends {
    new (...args: any[]): any;
}>(target: T) => T;
export declare function getSkillMetadata(target: any): SkillDecoratorOptions | undefined;
