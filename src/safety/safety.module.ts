// src/safety/safety.module.ts

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';

// 控制器
import { SafetyController } from './safety.controller';

// 服务
import { GeopoliticalRiskService } from './services/geopolitical-risk.service';
import { SafetyNotificationService } from './services/safety-notification.service';

// 适配器
import { UsStateDeptAdapter } from './adapters/us-state-dept.adapter';
import { UkFcdoAdapter } from './adapters/uk-fcdo.adapter';

/**
 * 安全预警模块
 * 
 * 提供地缘政治风险评估、安全警报管理、用户通知等功能
 * 
 * 主要功能：
 * - 聚合多数据源的旅行警告（US State Dept, UK FCDO等）
 * - 计算综合风险评估
 * - 生成和管理安全警报
 * - 评估行程安全影响
 * - 向用户发送安全通知
 * 
 * API端点：
 * - GET  /safety/assessment/:countryCode - 获取国家安全评估
 * - POST /safety/assessment/batch - 批量获取多国安全评估
 * - GET  /safety/risk-level/:countryCode - 获取国家风险等级
 * - GET  /safety/alerts - 获取所有活跃警报
 * - POST /safety/alerts/create - 创建安全警报
 * - POST /safety/trip-impact - 评估行程安全影响
 * - POST /safety/simulate/war - 模拟战争场景（测试用）
 */
@Module({
  imports: [
    ConfigModule,
    EventEmitterModule.forRoot(),
  ],
  controllers: [
    SafetyController,
  ],
  providers: [
    // 数据源适配器
    UsStateDeptAdapter,
    UkFcdoAdapter,
    
    // 核心服务
    GeopoliticalRiskService,
    SafetyNotificationService,
  ],
  exports: [
    // 导出服务供其他模块使用
    GeopoliticalRiskService,
    SafetyNotificationService,
    UsStateDeptAdapter,
    UkFcdoAdapter,
  ],
})
export class SafetyModule {}
