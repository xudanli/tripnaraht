/**
 * REPLAN 模块
 *
 * 专利实施例 2：环境变化触发 RESEARCH → PLAN_GEN → VERIFY 重规划
 * 独立模块避免与 DecisionKernelModule 循环依赖
 * 航班取消时通过 IReplanFlightSearch 搜索替代航班（6.2.9）
 */

import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { DecisionKernelModule } from '../../decision/decision-kernel.module';
import { DecisionOsP0Module } from '../../decision/decision-os-p0.module';
import { DsoFeedbackPersistenceModule } from './dso-feedback-persistence.module';
import { AmadeusDirectModule } from '../../mcp/amadeus-direct.module';
import { ReplanCoordinatorService } from './services/replan-coordinator.service';
import { ReplanFlightSearchAmadeusAdapter } from './services/replan-flight-search-amadeus.adapter';
import { REPLAN_TRIGGER } from '../../decision/kernel/replan-trigger.interface';
import { REPLAN_FLIGHT_SEARCH } from '../../decision/kernel/replan-flight-search.interface';
import { ContingencyOrchestratorService } from '../../decision/contingency/contingency-orchestrator.service';
import { ContingencyOrchestratorBootstrap } from '../../decision/contingency/contingency-orchestrator.bootstrap';

@Module({
  imports: [
    PrismaModule,
    DecisionOsP0Module,
    forwardRef(() => DecisionKernelModule),
    forwardRef(() => DsoFeedbackPersistenceModule),
    AmadeusDirectModule,
  ],
  providers: [
    ReplanCoordinatorService,
    ContingencyOrchestratorBootstrap,
    {
      provide: REPLAN_TRIGGER,
      useExisting: ContingencyOrchestratorService,
    },
    {
      provide: REPLAN_FLIGHT_SEARCH,
      useClass: ReplanFlightSearchAmadeusAdapter,
    },
  ],
  exports: [REPLAN_TRIGGER],
})
export class ReplanModule {}
