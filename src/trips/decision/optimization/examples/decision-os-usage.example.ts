/**
 * Decision OS 使用示例
 * 
 * 演示如何使用 Decision OS 门面服务进行：
 * 1. 决策推理
 * 2. 反馈处理
 * 3. 系统监控
 * 4. 稳定性分析
 * 
 * 运行方式: npx ts-node src/trips/decision/optimization/examples/decision-os-usage.example.ts
 */

import { DecisionOSFacadeService, DecisionRequest, FeedbackRequest } from '../decision-os-facade.service';
import { PolicyNetworkService } from '../learning/policy-network.service';
import { OnlineLearningLoopService } from '../learning/online-learning-loop.service';
import { DSOSnapshotAuditService } from '../learning/dso-snapshot-audit.service';
import { DecisionMetricsService } from '../metrics/decision-metrics.service';
import { DifferentiableDecisionService } from '../differentiable/differentiable-decision.service';
import { DistributedLockService } from '../../../../redis/distributed-lock.service';
import type { DecisionState } from '../../../../decision/kernel/decision-state.types';

// ========== 辅助函数 ==========

function createSampleDSO(overrides: Partial<DecisionState> = {}): DecisionState {
  return {
    userIntent: {
      days: 5,
      destination: 'Iceland',
      mode: 'drive',
      preferences: {
        scenic: 0.8,
        adventure: 0.6,
        comfort: 0.7,
      },
    },
    constraints: {
      feasible: true,
      violations: [],
      hardConstraints: {
        maxBudget: 5000,
        mustVisit: ['Golden Circle', 'Blue Lagoon'],
      },
    },
    systemState: {
      currentPhase: 'PLAN_GEN',
      confidence: 0.7,
      version: 1,
      requestId: `req-${Date.now()}`,
    },
    tripState: {
      currentPlan: null,
    },
    environmentState: {
      weather: { conditions: 'partly_cloudy', temperature: 12 },
    },
    ...overrides,
  } as DecisionState;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ========== 示例场景 ==========

async function example1_BasicDecision(facade: DecisionOSFacadeService) {
  console.log('\n========== 示例 1: 基本决策 ==========\n');

  const request: DecisionRequest = {
    requestId: 'example-req-001',
    userId: 'user-demo-001',
    dso: createSampleDSO(),
  };

  console.log('发送决策请求...');
  const response = await facade.makeDecision(request);

  console.log('决策结果:');
  console.log(`  推荐动作: ${response.recommendedAction}`);
  console.log(`  期望效用: ${response.expectedUtility.toFixed(4)}`);
  console.log(`  置信度: ${response.confidence.toFixed(4)}`);
  console.log(`  策略熵: ${response.policyEntropy.toFixed(4)}`);
  console.log(`  DSO 版本: ${response.dsoVersion}`);
  console.log(`  延迟: ${response.latencyMs.toFixed(2)}ms`);

  console.log('\n动作概率分布:');
  response.actionProbabilities.forEach((prob, action) => {
    const bar = '█'.repeat(Math.round(prob * 40));
    console.log(`  ${action.padEnd(18)} ${(prob * 100).toFixed(1).padStart(5)}% ${bar}`);
  });
}

async function example2_FeedbackLoop(facade: DecisionOSFacadeService) {
  console.log('\n========== 示例 2: 反馈学习循环 ==========\n');

  const userId = 'user-learning-001';
  const numDecisions = 5;

  console.log(`模拟 ${numDecisions} 次决策和反馈...\n`);

  for (let i = 0; i < numDecisions; i++) {
    const decisionId = `learning-req-${i + 1}`;

    // 1. 做出决策
    const dso = createSampleDSO({
      systemState: {
        requestId: decisionId,
        currentPhase: 'PLAN_GEN',
        confidence: 0.5 + i * 0.1,
        version: i + 1,
      },
    });

    const decision = await facade.makeDecision({
      requestId: decisionId,
      userId,
      dso,
    });

    // 2. 模拟用户反馈
    const satisfactionScore = 0.6 + Math.random() * 0.3;

    const feedbackResult = await facade.processFeedback({
      decisionId,
      userId,
      satisfactionScore,
      actualUtility: satisfactionScore * 0.9,
      explicitFeedback: satisfactionScore > 0.8 
        ? { type: 'LIKE', comment: '很满意' }
        : { type: 'NEUTRAL' },
      behavioralSignals: {
        completed: satisfactionScore > 0.7,
        modificationCount: Math.floor(Math.random() * 3),
      },
    });

    console.log(`决策 #${i + 1}: action=${decision.recommendedAction.padEnd(16)}, ` +
                `satisfaction=${satisfactionScore.toFixed(2)}, ` +
                `learning=${feedbackResult.learningTriggered ? '✓' : '○'}`);

    await sleep(10);
  }

  // 3. 查看学习统计
  const stats = facade.getLearningStatistics();
  console.log('\n学习统计:');
  console.log(`  收敛状态: ${stats.convergence}`);
  console.log(`  总更新次数: ${stats.totalUpdates}`);
  if (stats.regret) {
    console.log(`  累积遗憾: ${stats.regret.cumulative.toFixed(4)}`);
    console.log(`  理论边界: ${stats.regret.bound.toFixed(4)}`);
  }
}

async function example3_StabilityAnalysis(facade: DecisionOSFacadeService) {
  console.log('\n========== 示例 3: 稳定性分析 ==========\n');

  const requestId = 'stability-analysis-001';

  // 模拟系统状态演进
  const phases = ['INTAKE', 'RESEARCH', 'PLAN_GEN', 'OPTIMIZE', 'VERIFY', 'DONE'];
  
  console.log('模拟决策状态演进...\n');

  for (let i = 0; i < phases.length; i++) {
    const dso = createSampleDSO({
      constraints: {
        feasible: true,
        violations: Array(Math.max(0, 3 - i)).fill('constraint'),
      },
      systemState: {
        requestId,
        currentPhase: phases[i],
        confidence: 0.3 + i * 0.12,
        version: i + 1,
      },
    });

    await facade.makeDecision({
      requestId,
      userId: 'stability-user',
      dso,
    });

    console.log(`Phase ${i + 1}/${phases.length}: ${phases[i].padEnd(10)} confidence=${(0.3 + i * 0.12).toFixed(2)}`);
  }

  // 获取稳定性报告
  const report = await facade.getStabilityReport(requestId);

  if (report) {
    console.log('\nLyapunov 稳定性分析:');
    console.log(`  系统稳定: ${report.isStable ? '✅ 是' : '❌ 否'}`);
    console.log(`  收敛率: ${report.convergenceRate?.toFixed(4) ?? 'N/A'}`);
    console.log(`  建议: ${report.recommendation}`);

    console.log('\nLyapunov 函数追踪:');
    report.lyapunovTrace.values.forEach((v, i) => {
      const bar = '█'.repeat(Math.round(v.lyapunovValue * 20));
      console.log(`  V${i + 1}: ${v.lyapunovValue.toFixed(4)} ${bar} (${v.phase})`);
    });
  }
}

async function example4_SystemMonitoring(facade: DecisionOSFacadeService) {
  console.log('\n========== 示例 4: 系统监控 ==========\n');

  // 获取系统状态
  const status = facade.getSystemStatus();

  console.log('系统健康状态:');
  console.log(`  整体状态: ${status.healthy ? '✅ 健康' : '❌ 异常'}`);
  console.log(`  运行时间: ${(status.uptime / 1000).toFixed(1)}s`);

  console.log('\n组件状态:');
  Object.entries(status.components).forEach(([name, available]) => {
    console.log(`  ${name.padEnd(20)} ${available ? '✅' : '○'}`);
  });

  console.log('\n运行指标:');
  console.log(`  总决策数: ${status.metrics.totalDecisions}`);
  console.log(`  总反馈数: ${status.metrics.totalFeedback}`);
  console.log(`  总更新数: ${status.metrics.totalUpdates}`);
  console.log(`  收敛状态: ${status.metrics.convergenceStatus}`);

  // 导出 Prometheus 指标
  console.log('\nPrometheus 指标样例:');
  const metrics = facade.exportMetrics();
  const lines = metrics.split('\n').filter(l => l && !l.startsWith('#')).slice(0, 5);
  lines.forEach(l => console.log(`  ${l}`));
  console.log('  ...');
}

async function example5_ModelTraining(facade: DecisionOSFacadeService) {
  console.log('\n========== 示例 5: 模型训练 ==========\n');

  // 准备训练数据
  const samples = Array.from({ length: 20 }, (_, i) => ({
    dso: createSampleDSO({
      systemState: { requestId: `training-${i}`, currentPhase: 'PLAN_GEN', confidence: 0.3 + i * 0.03, version: i + 1 },
    }),
    targetUtility: 0.5 + i * 0.02,
  }));

  console.log(`准备了 ${samples.length} 个训练样本`);

  // 训练可微模型
  console.log('\n训练可微决策模型...');
  const diffResult = await facade.trainDifferentiableModel(samples, { learningRate: 0.01 });
  console.log(`  损失: ${diffResult.loss.toFixed(6)}`);
  console.log(`  参数更新: ${diffResult.parametersUpdated ? '✓' : '○'}`);

  // 训练策略网络
  const policySamples = samples.map(s => ({
    state: s.dso,
    action: 'ACCEPT_PLAN' as const,
    reward: s.targetUtility,
  }));

  console.log('\n训练策略网络...');
  const policyResult = facade.updatePolicyNetwork(policySamples);
  console.log(`  损失: ${policyResult.loss.toFixed(6)}`);
  console.log(`  梯度范数: ${policyResult.gradientNorm.toFixed(6)}`);
}

// ========== 主函数 ==========

async function main() {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║       Decision OS 使用示例演示              ║');
  console.log('╚════════════════════════════════════════════╝');

  // 初始化门面服务（带完整依赖）
  const facade = new DecisionOSFacadeService(
    undefined, // objectiveFunction
    undefined, // expectedUtility (需要复杂依赖)
    undefined, // worldModel
    new PolicyNetworkService(),
    new OnlineLearningLoopService(),
    undefined, // weightLearner
    new DifferentiableDecisionService(),
    new DSOSnapshotAuditService(),
    new DecisionMetricsService(),
    new DistributedLockService(),
  );

  await facade.onModuleInit();

  // 配置学习循环
  const learningLoop = (facade as any).learningLoop as OnlineLearningLoopService;
  learningLoop?.configure({ minFeedbackCount: 3 });

  try {
    await example1_BasicDecision(facade);
    await example2_FeedbackLoop(facade);
    await example3_StabilityAnalysis(facade);
    await example4_SystemMonitoring(facade);
    await example5_ModelTraining(facade);

    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║            所有示例执行完成！               ║');
    console.log('╚════════════════════════════════════════════╝\n');

  } catch (error) {
    console.error('示例执行失败:', error);
  }
}

// 仅当直接运行时执行
if (require.main === module) {
  main().catch(console.error);
}

export { main, createSampleDSO };
