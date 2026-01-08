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
  SKILL_DECISION_RUN_THREE_GUARDIANS,
  SKILL_DECISION_EXPLAIN_FOR_HUMAN,
  SKILL_DEM_GET_PROFILE,
  SKILL_READINESS_GENERATE_CHECKLIST,
  SKILL_READINESS_SUMMARIZE_RISKS,
  SKILL_READINESS_CHECK_VISA_WINDOW,
  SKILL_ROUTE_DIRECTION_PICK_FOR_INTENT,
  SKILL_ROUTE_DIRECTION_LIST_FOR_COUNTRY,
  SKILL_TRIP_QUICK_EVALUATE,
  SKILL_COUNTRY_PACK_SUGGEST_IMPROVEMENTS,
  SKILL_WORLD_BUILD_CONTEXT,
} from '../skills.tokens';

@Injectable()
export class SkillsRegistryService {
  private readonly skills = new Map<string, Skill>();

  constructor(
    @Optional() @Inject(SKILL_DEM_GET_PROFILE) private readonly demGetProfile?: Skill,
    @Optional() @Inject(SKILL_WORLD_BUILD_CONTEXT) private readonly worldBuildContext?: Skill,
    @Optional() @Inject(SKILL_DECISION_ABU_CHECK) private readonly decisionAbuCheck?: Skill,
    @Optional() @Inject(SKILL_DECISION_DRDRE_PACE) private readonly decisionDrdrePace?: Skill,
    @Optional() @Inject(SKILL_DECISION_NEPTUNE_REPAIR) private readonly decisionNeptuneRepair?: Skill,
    @Optional() @Inject(SKILL_DECISION_RUN_THREE_GUARDIANS) private readonly decisionRunThreeGuardians?: Skill,
    @Optional() @Inject(SKILL_DECISION_EXPLAIN_FOR_HUMAN) private readonly decisionExplainForHuman?: Skill,
    @Optional()
    @Inject(SKILL_ROUTE_DIRECTION_PICK_FOR_INTENT)
    private readonly routeDirectionPickForIntent?: Skill,
    @Optional()
    @Inject(SKILL_ROUTE_DIRECTION_LIST_FOR_COUNTRY)
    private readonly routeDirectionListForCountry?: Skill,
    @Optional()
    @Inject(SKILL_READINESS_GENERATE_CHECKLIST)
    private readonly readinessGenerateChecklist?: Skill,
    @Optional() @Inject(SKILL_READINESS_SUMMARIZE_RISKS) private readonly readinessSummarizeRisks?: Skill,
    @Optional() @Inject(SKILL_READINESS_CHECK_VISA_WINDOW) private readonly readinessCheckVisaWindow?: Skill,
    @Optional() @Inject(SKILL_TRIP_QUICK_EVALUATE) private readonly tripQuickEvaluate?: Skill,
    @Optional() @Inject(SKILL_COUNTRY_PACK_NEW_SKELETON) private readonly countryPackNewSkeleton?: Skill,
    @Optional() @Inject(SKILL_COUNTRY_PACK_VALIDATE) private readonly countryPackValidate?: Skill,
    @Optional()
    @Inject(SKILL_COUNTRY_PACK_GENERATE_REGRESSION_TESTS)
    private readonly countryPackGenerateRegressionTests?: Skill,
    @Optional()
    @Inject(SKILL_COUNTRY_PACK_SUGGEST_IMPROVEMENTS)
    private readonly countryPackSuggestImprovements?: Skill,
  ) {
    // 注册所有 Skills（只注册成功注入的）
    if (this.demGetProfile) this.registerSkill(this.demGetProfile);
    if (this.worldBuildContext) this.registerSkill(this.worldBuildContext);
    if (this.decisionAbuCheck) this.registerSkill(this.decisionAbuCheck);
    if (this.decisionDrdrePace) this.registerSkill(this.decisionDrdrePace);
    if (this.decisionNeptuneRepair) this.registerSkill(this.decisionNeptuneRepair);
    if (this.decisionRunThreeGuardians) this.registerSkill(this.decisionRunThreeGuardians);
    if (this.decisionExplainForHuman) this.registerSkill(this.decisionExplainForHuman);
    if (this.routeDirectionPickForIntent) this.registerSkill(this.routeDirectionPickForIntent);
    if (this.routeDirectionListForCountry) this.registerSkill(this.routeDirectionListForCountry);
    if (this.readinessGenerateChecklist) this.registerSkill(this.readinessGenerateChecklist);
    if (this.readinessSummarizeRisks) this.registerSkill(this.readinessSummarizeRisks);
    if (this.readinessCheckVisaWindow) this.registerSkill(this.readinessCheckVisaWindow);
    if (this.tripQuickEvaluate) this.registerSkill(this.tripQuickEvaluate);
    if (this.countryPackNewSkeleton) this.registerSkill(this.countryPackNewSkeleton);
    if (this.countryPackValidate) this.registerSkill(this.countryPackValidate);
    if (this.countryPackGenerateRegressionTests) this.registerSkill(this.countryPackGenerateRegressionTests);
    if (this.countryPackSuggestImprovements) this.registerSkill(this.countryPackSuggestImprovements);
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
   * 检查 Skill 是否已注册
   */
  hasSkill(name: string): boolean {
    return this.skills.has(name);
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

