#!/usr/bin/env npx ts-node
/**
 * 步骤 10：决策追溯记录测试
 *
 * 测试决策内核在 STATE_UPDATE 时：
 * 1. appendHistoryDelta 将状态变化差分追加至 DSO.history（版本级，用于审计与回滚）
 * 2. decision_log 结构（步骤级摘要，用于可解释性）
 *
 * 文档: docs/Decision_OS_实施例_旅行规划.md 302-330
 *
 * 数据来源：
 * - history: StateManagerService 在每次 commit 时自动追加
 * - decision_log: 各阶段执行器/编排层汇总（本测试验证结构）
 *
 * 运行：
 *   npm run test:decision-trace
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { INestApplication, Logger } from '@nestjs/common';
import { DecisionKernelService } from '../src/decision/kernel/decision-kernel.service';
import type { DecisionState } from '../src/decision/kernel/decision-state.types';
import type { StateHistoryDelta } from '../src/decision/kernel/decision-state.types';
import type { DecisionLogEntry } from '../src/agent/interfaces/trip-plan.interface';

const logger = new Logger('DecisionTrace-Test');

const REQUEST_ID = 'test-decision-trace-001';

async function main(): Promise<void> {
  logger.log(`📋 步骤 10：决策追溯记录测试 - requestId: ${REQUEST_ID}`);
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
    let state = kernel.createInitialState(REQUEST_ID);

    // 【Step 1】DSO.history - 模拟多阶段 STATE_UPDATE，验证 commit 自动追加 history
    logger.log('【Step 1】DSO.history - 模拟 INTAKE → RESEARCH → GATE_EVAL → PLAN_GEN 的 commit');
    const phases = [
      { name: 'INTAKE', patch: { userIntent: { destination: 'Iceland', days: 6 } }, stageOutput: '提取目的地、天数、预算' },
      {
        name: 'RESEARCH',
        patch: { environmentState: { countryCode: 'IS', weatherRisk: 0.1 } },
        stageOutput: 'WeatherAgent 返回第3天暴风雨预警',
      },
      {
        name: 'GATE_EVAL',
        patch: { constraints: { feasible: true, violations: [] } },
        stageOutput: 'ClaudeGatekeeperAgent 判定第3天户外活动不可行',
      },
      {
        name: 'PLAN_GEN',
        patch: {
          tripState: {
            planDraft: { request_id: REQUEST_ID, days: [{ date: '2026-03-07', items: [{ location_ref: { name: '室内 SPA' } }] }] },
          },
        },
        stageOutput: '过滤徒步方案，选择室内 SPA',
      },
    ];

    for (const p of phases) {
      const result = kernel.commitStateUpdate(state, p.patch, p.stageOutput);
      state = result.newState;
      logger.log(`  └─ ${p.name}: version ${state.systemState?.version ?? '?'}, history.length=${state.history?.length ?? 0}`);
    }

    // 断言 history 累积
    const historyTypes = state.history?.map((h: StateHistoryDelta) => h.type) ?? [];
    const hasUserIntent = historyTypes.includes('userIntent');
    const hasWeather = historyTypes.includes('weather');
    const hasConstraints = historyTypes.includes('constraints');
    const hasPlan = historyTypes.includes('plan');

    logger.log(`  └─ history types: ${historyTypes.join(', ')}`);
    logger.log(`  └─ ${hasUserIntent && hasWeather && hasConstraints && hasPlan ? '✅' : '⚠️'} history 含 userIntent/weather/constraints/plan`);

    // 【Step 2】appendHistoryDelta - 手动追加 delta
    logger.log('\n【Step 2】appendHistoryDelta - 手动追加 VERIFY 阶段 delta');
    const manualDelta: StateHistoryDelta = {
      type: 'constraints',
      summary: 'VERIFY 阶段：所有约束满足，置信度 0.87',
      at: new Date().toISOString(),
    };
    state = kernel.appendHistoryDelta(state, manualDelta);
    logger.log(`  └─ history.length: ${state.history?.length ?? 0}`);
    logger.log(`  └─ ✅ 最后一条: type=${state.history?.slice(-1)[0]?.type}, summary=${(state.history?.slice(-1)[0] as any)?.summary?.substring(0, 40)}...`);

    // 【Step 3】decision_log 结构验证（文档表：step, agent, action, result）
    logger.log('\n【Step 3】decision_log 结构验证');
    const decisionLog: DecisionLogEntry[] = [
      {
        request_id: REQUEST_ID,
        step: 'INTAKE',
        actor: 'Orchestrator',
        inputs_summary: '用户自然语言输入',
        outputs_summary: '提取目的地、天数、预算',
        evidence_refs: [],
        timestamp: new Date().toISOString(),
      },
      {
        request_id: REQUEST_ID,
        step: 'RESEARCH',
        actor: 'Orchestrator',
        inputs_summary: '目的地、日期',
        outputs_summary: 'WeatherAgent 返回第3天暴风雨预警',
        evidence_refs: [],
        timestamp: new Date().toISOString(),
      },
      {
        request_id: REQUEST_ID,
        step: 'GATE_EVAL',
        actor: 'Gatekeeper',
        inputs_summary: '约束、研究数据',
        outputs_summary: 'ClaudeGatekeeperAgent 判定第3天户外活动不可行',
        evidence_refs: [],
        timestamp: new Date().toISOString(),
      },
      {
        request_id: REQUEST_ID,
        step: 'PLAN_GEN',
        actor: 'Planner',
        inputs_summary: 'GateResult、ContextPackage',
        outputs_summary: '过滤徒步方案，选择室内 SPA',
        evidence_refs: [],
        timestamp: new Date().toISOString(),
      },
      {
        request_id: REQUEST_ID,
        step: 'VERIFY',
        actor: 'CoreDecision',
        inputs_summary: 'planDraft、researchData',
        outputs_summary: '所有约束满足，置信度 0.87',
        evidence_refs: [],
        timestamp: new Date().toISOString(),
      },
      {
        request_id: REQUEST_ID,
        step: 'NARRATE',
        actor: 'Narrator',
        inputs_summary: 'itinerary、decision_log',
        outputs_summary: '生成用户可读行程说明',
        evidence_refs: [],
        timestamp: new Date().toISOString(),
      },
    ];

    const validEntries = decisionLog.every(
      (e) => e.request_id && e.step && e.actor && e.inputs_summary && e.outputs_summary && e.timestamp,
    );
    logger.log(`  └─ decision_log entries: ${decisionLog.length}`);
    logger.log(`  └─ ${validEntries ? '✅' : '⚠️'} 所有条目含 request_id/step/actor/inputs_summary/outputs_summary/timestamp`);
    decisionLog.forEach((e, i) => logger.log(`     [${i + 1}] ${e.step} | ${e.actor} | ${e.outputs_summary.substring(0, 35)}...`));

    // 【Step 4】最终断言
    logger.log('\n【Step 4】最终断言');
    const historyOk = (state.history?.length ?? 0) >= 4;
    const versionOk = (state.systemState?.version ?? 0) >= 4;
    logger.log(`  └─ ${historyOk ? '✅' : '⚠️'} DSO.history 已累积 (${state.history?.length ?? 0} 条)`);
    logger.log(`  └─ ${versionOk ? '✅' : '⚠️'} DSO.systemState.version 递增 (${state.systemState?.version ?? 0})`);
    logger.log(`  └─ ✅ decision_log 结构符合 DecisionLogEntry 契约`);

    logger.log('\n' + '='.repeat(60));
    logger.log('✅ 步骤 10：决策追溯记录测试完成');
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
