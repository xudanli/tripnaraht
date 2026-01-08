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
import { TripsModule } from '../trips/trips.module';

// DEM Skills
import { DemGetProfileSkill } from './dem/dem-get-profile.skill';

// Decision Skills
import { DecisionAbuCheckSkill } from './decision/decision-abu-check.skill';
import { DecisionDrdrePaceSkill } from './decision/decision-drdre-pace.skill';
import { DecisionNeptuneRepairSkill } from './decision/decision-neptune-repair.skill';

// RouteDirection Skills
import { RouteDirectionPickForIntentSkill } from './route-direction/route-direction-pick-for-intent.skill';
import { RouteDirectionListForCountrySkill } from './route-direction/route-direction-list-for-country.skill';

// Readiness Skills
import { ReadinessGenerateChecklistSkill } from './readiness/readiness-generate-checklist.skill';
import { ReadinessSummarizeRisksSkill } from './readiness/readiness-summarize-risks.skill';
import { ReadinessCheckVisaWindowSkill } from './readiness/readiness-check-visa-window.skill';

// Trip Skills
import { TripQuickEvaluateSkill } from './trip/trip-quick-evaluate.skill';

// World Skills
import { WorldBuildContextSkill } from './world/world-build-context.skill';

// Decision Skills (additional)
import { DecisionRunThreeGuardiansSkill } from './decision/decision-run-three-guardians.skill';
import { DecisionExplainForHumanSkill } from './decision/decision-explain-for-human.skill';

// CountryPack Skills
import { CountryPackNewSkeletonSkill } from './country-pack/country-pack-new-skeleton.skill';
import { CountryPackValidateSkill } from './country-pack/country-pack-validate.skill';
import { CountryPackGenerateRegressionTestsSkill } from './country-pack/country-pack-generate-regression-tests.skill';
import { CountryPackSuggestImprovementsSkill } from './country-pack/country-pack-suggest-improvements.skill';

// Skills Registry Service
import { SkillsRegistryService } from './services/skills-registry.service';
import { SKILLS_REGISTRY_TOKEN } from './services/skills-registry.token';
import {
  SKILL_COUNTRY_PACK_GENERATE_REGRESSION_TESTS,
  SKILL_COUNTRY_PACK_NEW_SKELETON,
  SKILL_COUNTRY_PACK_SUGGEST_IMPROVEMENTS,
  SKILL_COUNTRY_PACK_VALIDATE,
  SKILL_READINESS_CHECK_VISA_WINDOW,
  SKILL_TRIP_QUICK_EVALUATE,
  SKILL_DECISION_ABU_CHECK,
  SKILL_DECISION_DRDRE_PACE,
  SKILL_DECISION_NEPTUNE_REPAIR,
  SKILL_DECISION_RUN_THREE_GUARDIANS,
  SKILL_DECISION_EXPLAIN_FOR_HUMAN,
  SKILL_DEM_GET_PROFILE,
  SKILL_READINESS_GENERATE_CHECKLIST,
  SKILL_READINESS_SUMMARIZE_RISKS,
  SKILL_ROUTE_DIRECTION_PICK_FOR_INTENT,
  SKILL_ROUTE_DIRECTION_LIST_FOR_COUNTRY,
  SKILL_WORLD_BUILD_CONTEXT,
} from './skills.tokens';

// DecisionModule 在 MCP 模式下已修复（使用 PlacesLiteModule），默认启用
// 如需禁用，设置 ENABLE_DECISION_SKILLS=false
const enableDecisionSkills = process.env.ENABLE_DECISION_SKILLS !== 'false';
// readiness.generateChecklist 目前依赖 DecisionModule（ReadinessAgentService 在 decision 模块内）
const enableReadinessChecklistSkill = enableDecisionSkills;

@Module({
  imports: [
    ...(enableDecisionSkills ? [DecisionModule] : []),
    RouteDirectionsModule,
    ReadinessModule,
    TripsModule, // 提供 TripMetricsService 和 TripConflictsService
  ],
  providers: [
    // DEM Skills
    DemGetProfileSkill,
    { provide: SKILL_DEM_GET_PROFILE, useExisting: DemGetProfileSkill },
    
    // World Skills
    WorldBuildContextSkill,
    { provide: SKILL_WORLD_BUILD_CONTEXT, useExisting: WorldBuildContextSkill },
    
    // Decision Skills
    ...(enableDecisionSkills
      ? [
          DecisionAbuCheckSkill,
          DecisionDrdrePaceSkill,
          DecisionNeptuneRepairSkill,
          DecisionRunThreeGuardiansSkill,
          DecisionExplainForHumanSkill,
        ]
      : []),
    ...(enableDecisionSkills
      ? [
          { provide: SKILL_DECISION_ABU_CHECK, useExisting: DecisionAbuCheckSkill },
          { provide: SKILL_DECISION_DRDRE_PACE, useExisting: DecisionDrdrePaceSkill },
          { provide: SKILL_DECISION_NEPTUNE_REPAIR, useExisting: DecisionNeptuneRepairSkill },
          { provide: SKILL_DECISION_RUN_THREE_GUARDIANS, useExisting: DecisionRunThreeGuardiansSkill },
          { provide: SKILL_DECISION_EXPLAIN_FOR_HUMAN, useExisting: DecisionExplainForHumanSkill },
        ]
      : []),
    
    // RouteDirection Skills
    RouteDirectionPickForIntentSkill,
    RouteDirectionListForCountrySkill,
    { provide: SKILL_ROUTE_DIRECTION_PICK_FOR_INTENT, useExisting: RouteDirectionPickForIntentSkill },
    { provide: SKILL_ROUTE_DIRECTION_LIST_FOR_COUNTRY, useExisting: RouteDirectionListForCountrySkill },
    
    // Readiness Skills
    ...(enableReadinessChecklistSkill
      ? [ReadinessGenerateChecklistSkill, ReadinessSummarizeRisksSkill, ReadinessCheckVisaWindowSkill]
      : []),
    ...(enableReadinessChecklistSkill
      ? [
          { provide: SKILL_READINESS_GENERATE_CHECKLIST, useExisting: ReadinessGenerateChecklistSkill },
          { provide: SKILL_READINESS_SUMMARIZE_RISKS, useExisting: ReadinessSummarizeRisksSkill },
          { provide: SKILL_READINESS_CHECK_VISA_WINDOW, useExisting: ReadinessCheckVisaWindowSkill },
        ]
      : []),
    
    // Trip Skills
    TripQuickEvaluateSkill,
    { provide: SKILL_TRIP_QUICK_EVALUATE, useExisting: TripQuickEvaluateSkill },
    
    // CountryPack Skills
    CountryPackNewSkeletonSkill,
    CountryPackValidateSkill,
    CountryPackGenerateRegressionTestsSkill,
    CountryPackSuggestImprovementsSkill,
    { provide: SKILL_COUNTRY_PACK_NEW_SKELETON, useExisting: CountryPackNewSkeletonSkill },
    { provide: SKILL_COUNTRY_PACK_VALIDATE, useExisting: CountryPackValidateSkill },
    {
      provide: SKILL_COUNTRY_PACK_GENERATE_REGRESSION_TESTS,
      useExisting: CountryPackGenerateRegressionTestsSkill,
    },
    {
      provide: SKILL_COUNTRY_PACK_SUGGEST_IMPROVEMENTS,
      useExisting: CountryPackSuggestImprovementsSkill,
    },
    
    // Registry
    SkillsRegistryService,
    { provide: SKILLS_REGISTRY_TOKEN, useExisting: SkillsRegistryService },
  ],
  exports: [
    SkillsRegistryService,
    SKILLS_REGISTRY_TOKEN,
    DemGetProfileSkill,
    WorldBuildContextSkill,
    ...(enableDecisionSkills
      ? [
          DecisionAbuCheckSkill,
          DecisionDrdrePaceSkill,
          DecisionNeptuneRepairSkill,
          DecisionRunThreeGuardiansSkill,
          DecisionExplainForHumanSkill,
        ]
      : []),
    RouteDirectionPickForIntentSkill,
    RouteDirectionListForCountrySkill,
    ...(enableReadinessChecklistSkill
      ? [ReadinessGenerateChecklistSkill, ReadinessSummarizeRisksSkill, ReadinessCheckVisaWindowSkill]
      : []),
    TripQuickEvaluateSkill,
    CountryPackNewSkeletonSkill,
    CountryPackValidateSkill,
    CountryPackGenerateRegressionTestsSkill,
    CountryPackSuggestImprovementsSkill,
  ],
})
export class SkillsModule {}

