// src/agent/context-engine/context-engine.module.ts
/**
 * Context Engine Module
 * 
 * TripNARA Context Engineer 模块
 */

import { Module, Global, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ContextEngineerService } from './services/context-engineer.service';
import { ContextMetricsService } from './services/context-metrics.service';
import { SkillsModule } from '../../skills/skills.module';
import { RedisModule } from '../../redis/redis.module';

@Global()
@Module({
  imports: [
    PrismaModule,
    forwardRef(() => SkillsModule), // 使用 forwardRef 避免循环依赖
    RedisModule, // 提供 RedisService（用于持久化缓存）
  ],
  providers: [
    ContextEngineerService,
    ContextMetricsService,
    { provide: 'ContextEngineerService', useExisting: ContextEngineerService },
  ],
  exports: [
    ContextEngineerService,
    ContextMetricsService,
    'ContextEngineerService',
  ],
})
export class ContextEngineModule {}