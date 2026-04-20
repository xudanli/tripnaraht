// src/admin/admin.module.ts

import { Module } from '@nestjs/common';
import { DataQualityAdminController } from './controllers/data-quality-admin.controller';
import { ConversationAdminController } from './controllers/conversation-admin.controller';
import { HarnessDiagnosticsAdminController } from './controllers/harness-diagnostics-admin.controller';
import { DoneVerifyDiagnosticsAdminController } from './controllers/done-verify-diagnostics-admin.controller';
import { DataQualityModule } from '../data-quality/data-quality.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TripsModule } from '../trips/trips.module';

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
  imports: [DataQualityModule, PrismaModule, TripsModule],
  controllers: [
    DataQualityAdminController,
    ConversationAdminController,
    HarnessDiagnosticsAdminController,
    DoneVerifyDiagnosticsAdminController,
  ],
  providers: [],
  exports: [],
})
export class AdminModule {}
