// src/skills/services/skills-registry.service.ts
/**
 * Skills Registry Service
 * 
 * 统一注册和管理所有 Skills
 */

import { Inject, Injectable, Optional } from '@nestjs/common';
import { Skill } from '../interfaces/skill.interface';
import {
  SKILL_COUNTRY_PACK_GENERATE_REGRESSION_TESTS,
  SKILL_COUNTRY_PACK_NEW_SKELETON,
  SKILL_COUNTRY_PACK_VALIDATE,
  SKILL_DECISION_ABU_CHECK,
  SKILL_DECISION_DRDRE_PACE,
  SKILL_DECISION_NEPTUNE_REPAIR,
  SKILL_DEM_GET_PROFILE,
  SKILL_READINESS_GENERATE_CHECKLIST,
  SKILL_ROUTE_DIRECTION_PICK_FOR_INTENT,
} from '../skills.tokens';

@Injectable()
export class SkillsRegistryService {
  private readonly skills = new Map<string, Skill>();

  constructor(
    @Optional() @Inject(SKILL_DEM_GET_PROFILE) private readonly demGetProfile?: Skill,
    @Optional() @Inject(SKILL_DECISION_ABU_CHECK) private readonly decisionAbuCheck?: Skill,
    @Optional() @Inject(SKILL_DECISION_DRDRE_PACE) private readonly decisionDrdrePace?: Skill,
    @Optional() @Inject(SKILL_DECISION_NEPTUNE_REPAIR) private readonly decisionNeptuneRepair?: Skill,
    @Optional()
    @Inject(SKILL_ROUTE_DIRECTION_PICK_FOR_INTENT)
    private readonly routeDirectionPickForIntent?: Skill,
    @Optional()
    @Inject(SKILL_READINESS_GENERATE_CHECKLIST)
    private readonly readinessGenerateChecklist?: Skill,
    @Optional() @Inject(SKILL_COUNTRY_PACK_NEW_SKELETON) private readonly countryPackNewSkeleton?: Skill,
    @Optional() @Inject(SKILL_COUNTRY_PACK_VALIDATE) private readonly countryPackValidate?: Skill,
    @Optional()
    @Inject(SKILL_COUNTRY_PACK_GENERATE_REGRESSION_TESTS)
    private readonly countryPackGenerateRegressionTests?: Skill,
  ) {
    // 注册所有 Skills（只注册成功注入的）
    if (this.demGetProfile) this.registerSkill(this.demGetProfile);
    if (this.decisionAbuCheck) this.registerSkill(this.decisionAbuCheck);
    if (this.decisionDrdrePace) this.registerSkill(this.decisionDrdrePace);
    if (this.decisionNeptuneRepair) this.registerSkill(this.decisionNeptuneRepair);
    if (this.routeDirectionPickForIntent) this.registerSkill(this.routeDirectionPickForIntent);
    if (this.readinessGenerateChecklist) this.registerSkill(this.readinessGenerateChecklist);
    if (this.countryPackNewSkeleton) this.registerSkill(this.countryPackNewSkeleton);
    if (this.countryPackValidate) this.registerSkill(this.countryPackValidate);
    if (this.countryPackGenerateRegressionTests) this.registerSkill(this.countryPackGenerateRegressionTests);
  }

  /**
   * 注册 Skill
   */
  registerSkill(skill: Skill): void {
    if (!skill) {
      console.error('⚠️ SkillsRegistryService Warning: Attempted to register undefined skill');
      return;
    }
    if (!skill.metadata) {
      console.error('⚠️ SkillsRegistryService Warning: Skill missing metadata', skill);
      return;
    }
    this.skills.set(skill.metadata.name, skill);
  }

  /**
   * 获取 Skill
   */
  getSkill(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  /**
   * 获取所有 Skills
   */
  getAllSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * 获取所有 Skill 元数据
   */
  getAllSkillMetadata() {
    return Array.from(this.skills.values()).map(skill => skill.metadata);
  }
}

