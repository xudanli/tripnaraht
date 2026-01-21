// src/agent/infra/infra.module.ts
/**
 * Agent Infra 模块 (V2.1)
 * 
 * 提供智能体基础设施服务：
 * - LLMExecutor: LLM 调用统一入口
 * - CoreGateway: 核心动作触发入口
 * - StateStore: 状态管理与版本控制
 * - TelemetryService: 调用链追踪与性能监控
 * - AuditLogService: 审计日志
 * 
 * 架构位置：Agent Infra 层
 */

import { Module, forwardRef } from '@nestjs/common';
import { LLMExecutorService } from './llm-executor.service';
import { CoreGatewayService } from './core-gateway.service';
import { StateStoreService } from './state-store.service';
import { TelemetryService } from './telemetry.service';
import { AuditLogService } from './audit-log.service';
import { TokenStatsService } from '../services/token-stats.service';
import { LlmModule } from '../../llm/llm.module';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [
    forwardRef(() => LlmModule), // 使用 forwardRef 解决循环依赖
    PrismaModule,
  ],
  providers: [
    LLMExecutorService,
    CoreGatewayService,
    StateStoreService,
    TelemetryService,
    AuditLogService,
    TokenStatsService, // Token使用统计服务（P0功能）
  ],
  exports: [
    LLMExecutorService,
    CoreGatewayService,
    StateStoreService,
    TelemetryService,
    AuditLogService,
    TokenStatsService, // 导出TokenStatsService供其他模块使用
  ],
})
export class AgentInfraModule {}
