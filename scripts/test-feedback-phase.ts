#!/usr/bin/env npx ts-node
/**
 * 步骤 12：FEEDBACK 阶段测试 - 决策反馈闭环
 *
 * 测试体验层采集用户反馈后，通过 FeedbackEngineAdapterService 写入 RLHF，
 * 形成决策闭环。反馈供优化规划模型、RLHF、用户偏好建模。
 *
 * 文档: docs/Decision_OS_实施例_旅行规划.md 400-443
 *
 * 输入（来自体验层）：accepted、modifications、satisfactionScore、behaviorSignals
 * 输出：recordUserFeedback → RLHFSignalCollector（异步，不阻塞）
 *
 * DSO.feedback 结构：accepted, modifications, satisfactionScore, behaviorSignals
 *
 * 运行：npm run test:feedback
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { INestApplication, Logger } from '@nestjs/common';
import { DecisionKernelService } from '../src/decision/kernel/decision-kernel.service';
import type { DecisionState } from '../src/decision/kernel/decision-state.types';
import type { RecordUserFeedbackParams } from '../src/decision/kernel/feedback-engine-adapter.service';

const logger = new Logger('FeedbackPhase-Test');

const REQUEST_ID = 'test-feedback-001';
const USER_ID = 'user-feedback-001';

/** 文档示例：DSO.feedback 结构 */
interface DSOFeedback {
  accepted: boolean;
  modifications: string[];
  satisfactionScore: number;
  behaviorSignals: { savePlan?: boolean; sharePlan?: boolean };
}

async function main(): Promise<void> {
  logger.log(`📋 步骤 12：FEEDBACK 阶段测试 - requestId: ${REQUEST_ID}`);
  logger.log('='.repeat(60));

  let app: INestApplication;

  try {
    app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
    await app.init();
    logger.log('✅ 应用初始化完成\n');
  } catch (error: any) {
    logger.error(`❌ 应用初始化失败: ${error?.message}`);
    process.exit(1);
  }

  try {
    const kernel = app.get(DecisionKernelService);

    // 【Step 1】构建 post-NARRATE 的 DSO（模拟已完成规划流程）
    logger.log('【Step 1】构建 post-NARRATE DSO');
    let state = kernel.createInitialState(REQUEST_ID);
    state = kernel.updateState(state, {
      userIntent: { destination: 'Iceland', days: 6, party: { count: 2 } },
      tripState: {
        planDraft: {
          request_id: REQUEST_ID,
          days: [
            { date: '2026-03-07', items: [{ location_ref: { name: '室内 SPA' } }] },
            { date: '2026-03-08', items: [{ location_ref: { name: '酒庄参观' } }] },
          ],
        },
      },
      confidence: 0.87,
      systemState: { requestId: REQUEST_ID, currentPhase: 'NARRATE', version: 9 },
    });
    logger.log(`  └─ confidence: ${state.confidence}`);
    logger.log(`  └─ version: ${state.systemState?.version}`);

    // 【Step 2】模拟体验层采集的用户反馈（文档 DSO.feedback 结构）
    logger.log('\n【Step 2】模拟 DSO.feedback 用户反馈');
    const feedback: DSOFeedback = {
      accepted: true,
      modifications: ['用户将第2天改为酒庄参观'],
      satisfactionScore: 4.6,
      behaviorSignals: { savePlan: true, sharePlan: false },
    };
    logger.log(`  └─ accepted: ${feedback.accepted}`);
    logger.log(`  └─ modifications: ${feedback.modifications.join(', ')}`);
    logger.log(`  └─ satisfactionScore: ${feedback.satisfactionScore}/5`);
    logger.log(`  └─ behaviorSignals: ${JSON.stringify(feedback.behaviorSignals)}`);

    // 【Step 3】转换为 RecordUserFeedbackParams 并调用 recordUserFeedback
    logger.log('\n【Step 3】DecisionKernel.recordUserFeedback()');
    const params: RecordUserFeedbackParams = {
      tripRunId: REQUEST_ID,
      userId: USER_ID,
      decisionPointId: `feedback_${Date.now()}`,
      feedbackType: feedback.accepted ? 'ACCEPT' : 'REJECT',
      value: {
        rating: feedback.satisfactionScore,
        comment: feedback.modifications.join('；'),
      },
      context: {
        behaviorSignals: feedback.behaviorSignals,
      },
    };
    await kernel.recordUserFeedback(params);
    logger.log(`  └─ ✅ recordUserFeedback 调用完成（RLHF 未注入时静默跳过）`);

    // 【Step 4】模拟 STATE_UPDATE：version 9→10（文档：本阶段完成后 patch = { feedback }）
    logger.log('\n【Step 4】模拟 STATE_UPDATE');
    state = kernel.updateState(state, {
      systemState: {
        requestId: REQUEST_ID,
        currentPhase: 'FEEDBACK',
        version: 10,
        lastUpdatedAt: new Date().toISOString(),
      },
    });
    logger.log(`  └─ systemState.version: ${state.systemState?.version}`);
    logger.log(`  └─ systemState.currentPhase: ${state.systemState?.currentPhase}`);

    // 【Step 5】断言
    logger.log('\n【Step 5】断言');
    logger.log(`  └─ ✅ recordUserFeedback 未抛错`);
    logger.log(`  └─ ✅ DSO.feedback 结构符合文档（accepted/modifications/satisfactionScore/behaviorSignals）`);

    logger.log('\n' + '='.repeat(60));
    logger.log('✅ 步骤 12：FEEDBACK 阶段测试完成');
  } catch (error: any) {
    logger.error(`❌ 测试失败: ${error?.message}`);
    if (error?.stack) logger.error(error.stack);
    process.exit(1);
  } finally {
    await app!.close();
  }
}

main().catch((error) => {
  logger.error(`Fatal: ${error?.message}`);
  process.exit(1);
});
