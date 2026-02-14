export interface ISkillActionAdapter {
    readonly actionName: string;
    readonly skillName: string;
    execute(input: any): Promise<any>;
}
export interface IActionSkillAdapter {
    readonly skillName: string;
    readonly actionName: string;
    execute(input: any): Promise<any>;
}
export interface IAdapterRegistry {
    registerSkillActionAdapter(adapter: ISkillActionAdapter): void;
    registerActionSkillAdapter(adapter: IActionSkillAdapter): void;
    getSkillActionAdapter(actionName: string): ISkillActionAdapter | undefined;
    getActionSkillAdapter(skillName: string): IActionSkillAdapter | undefined;
}
