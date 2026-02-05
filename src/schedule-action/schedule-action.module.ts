// src/schedule-action/schedule-action.module.ts

import { Module } from '@nestjs/common';
import { ScheduleActionService } from './schedule-action.service';
import { PlanningPolicyModule } from '../planning-policy/planning-policy.module';

/**
 * 行程动作模块
 * 
 * ⚠️ 控制器已删除（2026-02-03）
 * 行程动作服务已计划合并到 /agent/journey-assistant。
 * 前端应优先使用 journey-assistant 的 chat 和 adjust 接口。
 */
@Module({
  imports: [PlanningPolicyModule], // 导入以使用 PlaceToPoiHelperService
  providers: [ScheduleActionService],
  exports: [ScheduleActionService],
})
export class ScheduleActionModule {}
