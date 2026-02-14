export type SkillImportance = 'CRITICAL' | 'IMPORTANT' | 'OPTIONAL';
export declare function getSkillImportance(skillName: string): SkillImportance;
export declare function isCriticalSkill(skillName: string): boolean;
export declare function isImportantSkill(skillName: string): boolean;
export declare function isOptionalSkill(skillName: string): boolean;
export interface SkillFailureStrategy {
    shouldReject: boolean;
    shouldDegrade: boolean;
    shouldMarkMissing: boolean;
    shouldIgnore: boolean;
    errorMessage?: string;
}
export declare function getSkillFailureStrategy(skillName: string, error?: Error): SkillFailureStrategy;
