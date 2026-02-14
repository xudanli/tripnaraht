import { Type } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Skill } from '../interfaces/skill.interface';
import { SkillsRegistryService } from './skills-registry.service';
export declare class SkillScannerService {
    private readonly moduleRef;
    private readonly skillsRegistry;
    private readonly logger;
    private readonly registeredToolNames;
    constructor(moduleRef: ModuleRef, skillsRegistry: SkillsRegistryService);
    scanAndRegisterSkills(skillClasses: Type<Skill>[]): Promise<void>;
    getRegisteredSkillNames(): string[];
}
