// src/admin/admin.module.ts

import { Module, forwardRef } from '@nestjs/common';
import { DataQualityAdminController } from './controllers/data-quality-admin.controller';
import { ConversationAdminController } from './controllers/conversation-admin.controller';
import { HarnessDiagnosticsAdminController } from './controllers/harness-diagnostics-admin.controller';
import { DoneVerifyDiagnosticsAdminController } from './controllers/done-verify-diagnostics-admin.controller';
import { AgentOpsAdminController } from './controllers/agent-ops-admin.controller';
import { AdminAuthController } from './controllers/admin-auth.controller';
import { PhysicalDomainAdminController } from './controllers/physical-domain-admin.controller';
import { SpatialDomainAdminController } from './controllers/spatial-domain-admin.controller';
import { SkillsAdminController } from './controllers/skills-admin.controller';
import { DataQualityModule } from '../data-quality/data-quality.module';
import { SkillsModule } from '../skills/skills.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TripsModule } from '../trips/trips.module';
import { AgentModule } from '../agent/agent.module';
import { AuthModule } from '../auth/auth.module';
import { AdminActivityLogService } from './services/admin-activity-log.service';
import { SagaSideEffectReplayService } from './services/saga-side-effect-replay.service';
import { AdminAuthService } from './services/admin-auth.service';
import { AdminQualityMarkService } from './services/admin-quality-mark.service';
import { AutoDriftSamplerService } from './services/auto-drift-sampler.service';
import { AdminStrictAuthGuard } from './guards/admin-strict-auth.guard';
import { CountriesModule } from '../countries/countries.module';
import { CountriesAdminController } from '../countries/countries-admin.controller';
import { TrainingModule } from '../agent/training/training.module';

/**
 * Admin模块
 * 
 * 提供管理端接口：
 * - 数据质量管理
 * - 系统监控
 * - 配置管理
 * - 会话管理
 */
@Module({
  imports: [
    DataQualityModule,
    PrismaModule,
    TripsModule,
    forwardRef(() => AgentModule),
    forwardRef(() => SkillsModule),
    AuthModule,
    CountriesModule,
    TrainingModule,
  ],
  controllers: [
    CountriesAdminController,
    DataQualityAdminController,
    ConversationAdminController,
    HarnessDiagnosticsAdminController,
    DoneVerifyDiagnosticsAdminController,
    AgentOpsAdminController,
    AdminAuthController,
    PhysicalDomainAdminController,
    SpatialDomainAdminController,
    SkillsAdminController,
  ],
  providers: [
    AdminActivityLogService,
    SagaSideEffectReplayService,
    AdminAuthService,
    AdminQualityMarkService,
    AutoDriftSamplerService,
    AdminStrictAuthGuard,
  ],
  exports: [],
})
export class AdminModule {}
