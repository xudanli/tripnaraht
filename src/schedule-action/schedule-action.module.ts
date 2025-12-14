// src/schedule-action/schedule-action.module.ts

import { Module } from '@nestjs/common';
import { ScheduleActionController } from './schedule-action.controller';
import { ScheduleActionService } from './schedule-action.service';
import { PlanningPolicyModule } from '../planning-policy/planning-policy.module';

@Module({
  imports: [PlanningPolicyModule], // 导入以使用 PlaceToPoiHelperService
  controllers: [ScheduleActionController],
  providers: [ScheduleActionService],
  exports: [ScheduleActionService],
})
export class ScheduleActionModule {}
