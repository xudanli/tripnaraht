// src/skills/services/skills-registry.service.ts
/**
 * Skills Registry Service
 * 
 * 统一注册和管理所有 Skills
 */

import { Injectable } from '@nestjs/common';
import { Skill } from '../interfaces/skill.interface';
import { DemGetProfileSkill } from '../dem/dem-get-profile.skill';
import { DecisionAbuCheckSkill } from '../decision/decision-abu-check.skill';
import { DecisionDrdrePaceSkill } from '../decision/decision-drdre-pace.skill';
import { DecisionNeptuneRepairSkill } from '../decision/decision-neptune-repair.skill';
import { RouteDirectionPickForIntentSkill } from '../route-direction/route-direction-pick-for-intent.skill';
import { ReadinessGenerateChecklistSkill } from '../readiness/readiness-generate-checklist.skill';
import { CountryPackNewSkeletonSkill } from '../country-pack/country-pack-new-skeleton.skill';
import { CountryPackValidateSkill } from '../country-pack/country-pack-validate.skill';
import { CountryPackGenerateRegressionTestsSkill } from '../country-pack/country-pack-generate-regression-tests.skill';

@Injectable()
export class SkillsRegistryService {
  private readonly skills = new Map<string, Skill>();

  constructor(
    private readonly demGetProfile: DemGetProfileSkill,
    private readonly decisionAbuCheck: DecisionAbuCheckSkill,
    private readonly decisionDrdrePace: DecisionDrdrePaceSkill,
    private readonly decisionNeptuneRepair: DecisionNeptuneRepairSkill,
    private readonly routeDirectionPickForIntent: RouteDirectionPickForIntentSkill,
    private readonly readinessGenerateChecklist: ReadinessGenerateChecklistSkill,
    private readonly countryPackNewSkeleton: CountryPackNewSkeletonSkill,
    private readonly countryPackValidate: CountryPackValidateSkill,
    private readonly countryPackGenerateRegressionTests: CountryPackGenerateRegressionTestsSkill,
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

