/**
 * Agent Feedback Module
 *
 * 提供 RLHF 信号收集等反馈学习服务
 * 供 DecisionKernelModule 的 FeedbackEngineAdapter 使用
 *
 * Scheme D 第 4 层：FeedbackLearningSchedulerService 定期从 1–3 层数据更新权重
 */

import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { RLHFSignalCollectorService } from '../services/rlhf-signal-collector.service';
import { RLHFSignalController } from '../controllers/rlhf-signal.controller';
import { DecisionKernelModule } from '../../decision/decision-kernel.module';
import { OptimizationModule } from '../../trips/decision/optimization/optimization.module';
import { ContextEngineModule } from '../context-engine/context-engine.module';
import { FeedbackLearningSchedulerService } from './feedback-learning.scheduler';

@Module({
  imports: [
    PrismaModule,
    OptimizationModule, // WeightLearnerService for Scheme D Layer 4
    forwardRef(() => ContextEngineModule), // ContextLearningService for Block 重要性学习
    forwardRef(() => DecisionKernelModule), // 用户反馈 API 可选经 Kernel 统一入口
  ],
  controllers: [RLHFSignalController],
  providers: [RLHFSignalCollectorService, FeedbackLearningSchedulerService],
  exports: [RLHFSignalCollectorService, FeedbackLearningSchedulerService],
})
export class AgentFeedbackModule {}
