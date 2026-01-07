// src/skills/skills.module.ts
/**
 * Skills Module
 * 
 * 统一管理所有 Skills
 */

import { Module } from '@nestjs/common';
import { DecisionModule } from '../trips/decision/decision.module';
import { RouteDirectionsModule } from '../route-directions/route-directions.module';
import { ReadinessModule } from '../trips/readiness/readiness.module';

// DEM Skills
import { DemGetProfileSkill } from './dem/dem-get-profile.skill';

// Decision Skills
import { DecisionAbuCheckSkill } from './decision/decision-abu-check.skill';
import { DecisionDrdrePaceSkill } from './decision/decision-drdre-pace.skill';
import { DecisionNeptuneRepairSkill } from './decision/decision-neptune-repair.skill';

// RouteDirection Skills
import { RouteDirectionPickForIntentSkill } from './route-direction/route-direction-pick-for-intent.skill';

// Readiness Skills
import { ReadinessGenerateChecklistSkill } from './readiness/readiness-generate-checklist.skill';

// CountryPack Skills
import { CountryPackNewSkeletonSkill } from './country-pack/country-pack-new-skeleton.skill';
import { CountryPackValidateSkill } from './country-pack/country-pack-validate.skill';
import { CountryPackGenerateRegressionTestsSkill } from './country-pack/country-pack-generate-regression-tests.skill';

// Skills Registry Service
import { SkillsRegistryService } from './services/skills-registry.service';
import { SKILLS_REGISTRY_TOKEN } from './services/skills-registry.token';
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
} from './skills.tokens';

// MCP 模式下：DecisionModule 会导致 applicationContext 卡住（createApplicationContext 不返回）
// 默认禁用 decision skills；如需开启，设置 ENABLE_DECISION_SKILLS=true
const isMcpMode = process.env.MCP_MODE === 'true';
const enableDecisionSkills = !isMcpMode || process.env.ENABLE_DECISION_SKILLS === 'true';
// readiness.generateChecklist 目前依赖 DecisionModule（ReadinessAgentService 在 decision 模块内）
const enableReadinessChecklistSkill = enableDecisionSkills;

@Module({
  imports: [
    ...(enableDecisionSkills ? [DecisionModule] : []),
    RouteDirectionsModule,
    ReadinessModule,
  ],
  providers: [
    // DEM Skills
    DemGetProfileSkill,
    { provide: SKILL_DEM_GET_PROFILE, useExisting: DemGetProfileSkill },
    
    // Decision Skills
    ...(enableDecisionSkills
      ? [DecisionAbuCheckSkill, DecisionDrdrePaceSkill, DecisionNeptuneRepairSkill]
      : []),
    ...(enableDecisionSkills
      ? [
          { provide: SKILL_DECISION_ABU_CHECK, useExisting: DecisionAbuCheckSkill },
          { provide: SKILL_DECISION_DRDRE_PACE, useExisting: DecisionDrdrePaceSkill },
          { provide: SKILL_DECISION_NEPTUNE_REPAIR, useExisting: DecisionNeptuneRepairSkill },
        ]
      : []),
    
    // RouteDirection Skills
    RouteDirectionPickForIntentSkill,
    { provide: SKILL_ROUTE_DIRECTION_PICK_FOR_INTENT, useExisting: RouteDirectionPickForIntentSkill },
    
    // Readiness Skills
    ...(enableReadinessChecklistSkill ? [ReadinessGenerateChecklistSkill] : []),
    ...(enableReadinessChecklistSkill
      ? [{ provide: SKILL_READINESS_GENERATE_CHECKLIST, useExisting: ReadinessGenerateChecklistSkill }]
      : []),
    
    // CountryPack Skills
    CountryPackNewSkeletonSkill,
    CountryPackValidateSkill,
    CountryPackGenerateRegressionTestsSkill,
    { provide: SKILL_COUNTRY_PACK_NEW_SKELETON, useExisting: CountryPackNewSkeletonSkill },
    { provide: SKILL_COUNTRY_PACK_VALIDATE, useExisting: CountryPackValidateSkill },
    {
      provide: SKILL_COUNTRY_PACK_GENERATE_REGRESSION_TESTS,
      useExisting: CountryPackGenerateRegressionTestsSkill,
    },
    
    // Registry
    SkillsRegistryService,
    { provide: SKILLS_REGISTRY_TOKEN, useExisting: SkillsRegistryService },
  ],
  exports: [
    SkillsRegistryService,
    SKILLS_REGISTRY_TOKEN,
    DemGetProfileSkill,
    ...(enableDecisionSkills
      ? [DecisionAbuCheckSkill, DecisionDrdrePaceSkill, DecisionNeptuneRepairSkill]
      : []),
    RouteDirectionPickForIntentSkill,
    ...(enableReadinessChecklistSkill ? [ReadinessGenerateChecklistSkill] : []),
    CountryPackNewSkeletonSkill,
    CountryPackValidateSkill,
    CountryPackGenerateRegressionTestsSkill,
  ],
})
export class SkillsModule {}

