// src/planning-policy/planning-policy.module.ts

import { Module } from '@nestjs/common';
import { PolicyCompilerService } from './services/policy-compiler.service';
import { DefaultCostModel } from './services/cost-model.service';
import { HpSimulatorService } from './services/hp-simulator.service';
import { DaySchedulerService } from './services/day-scheduler.service';
import { ReplannerService } from './services/replanner.service';
import { FeasibilityService } from './services/feasibility.service';
import { RobustnessEvaluatorService } from './services/robustness-evaluator.service';
import { RankingService } from './services/ranking.service';
import { PlaceToPoiService } from './services/place-to-poi.service';
import { PlaceToPoiHelperService } from './services/place-to-poi-helper.service';
import { PlanningPolicyController } from './planning-policy.controller';

/**
 * 规划策略模块
 * 
 * 提供画像编译器、统一代价模型、HP模拟器、时间槽排程器、动态重排服务、
 * 统一可行性判定、稳健度评估和推荐排序
 */
@Module({
  controllers: [PlanningPolicyController],
  providers: [
    PolicyCompilerService,
    DefaultCostModel,
    HpSimulatorService,
    DaySchedulerService,
    ReplannerService,
    FeasibilityService,
    RobustnessEvaluatorService,
    RankingService,
    PlaceToPoiService,
    PlaceToPoiHelperService,
  ],
  exports: [
    PolicyCompilerService,
    DefaultCostModel,
    HpSimulatorService,
    DaySchedulerService,
    ReplannerService,
    FeasibilityService,
    RobustnessEvaluatorService,
    RankingService,
    PlaceToPoiService,
    PlaceToPoiHelperService,
  ],
})
export class PlanningPolicyModule {}
