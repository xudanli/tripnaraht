/**
 * 世界模型调度模块
 *
 * 专利实施例：多代理并发实测 - 外部调度调用 WeatherAgent 等并 pushEnvironmentDelta
 */

import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { DecisionKernelModule } from '../../decision/decision-kernel.module';
import { DsoFeedbackPersistenceModule } from './dso-feedback-persistence.module';
import { DomainAgentsModule } from '../../agent/services/domain-agents/domain-agents.module';
import { WorldModelPushScheduler } from './schedulers/world-model-push.scheduler';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => DecisionKernelModule),
    forwardRef(() => DsoFeedbackPersistenceModule),
    forwardRef(() => DomainAgentsModule),
  ],
  providers: [WorldModelPushScheduler],
})
export class WorldModelSchedulerModule {}
