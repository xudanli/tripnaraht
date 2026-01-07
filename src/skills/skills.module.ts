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

@Module({
  imports: [
    DecisionModule,
    RouteDirectionsModule,
    ReadinessModule,
  ],
  providers: [
    // DEM Skills
    DemGetProfileSkill,
    
    // Decision Skills
    DecisionAbuCheckSkill,
    DecisionDrdrePaceSkill,
    DecisionNeptuneRepairSkill,
    
    // RouteDirection Skills
    RouteDirectionPickForIntentSkill,
    
    // Readiness Skills
    ReadinessGenerateChecklistSkill,
    
    // CountryPack Skills
    CountryPackNewSkeletonSkill,
    CountryPackValidateSkill,
    CountryPackGenerateRegressionTestsSkill,
    
    // Registry
    SkillsRegistryService,
  ],
  exports: [
    SkillsRegistryService,
    DemGetProfileSkill,
    DecisionAbuCheckSkill,
    DecisionDrdrePaceSkill,
    DecisionNeptuneRepairSkill,
    RouteDirectionPickForIntentSkill,
    ReadinessGenerateChecklistSkill,
    CountryPackNewSkeletonSkill,
    CountryPackValidateSkill,
    CountryPackGenerateRegressionTestsSkill,
  ],
})
export class SkillsModule {}

