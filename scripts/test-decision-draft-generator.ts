// scripts/test-decision-draft-generator.ts

/**
 * 测试 Decision Draft Generator
 * 
 * 测试决策草案生成功能（业务层 + 技术层融合）
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DecisionDraftGeneratorService } from '../src/decision-draft/services/decision-draft-generator.service';
import { TripPlanRequest } from '../src/agent/interfaces/trip-plan.interface';

async function testDecisionDraftGenerator() {
  console.log('🚀 开始测试 Decision Draft Generator...\n');

  // 1. 创建 NestJS 应用上下文
  const app = await NestFactory.createApplicationContext(AppModule);
  const decisionDraftGenerator = app.get(DecisionDraftGeneratorService);

  // 2. 准备测试用例
  const testCases = [
    {
      name: '冰岛7天行程（不想太赶，想去高地）',
      userInput: '我们 3 个人，去冰岛 7 天，不想太赶，但想去高地。',
      tripPlanRequest: {
        request_id: `test-${Date.now()}`,
        origin: 'Beijing',
        destination: 'Iceland',
        days: 7,
        travelers: [
          {
            id: 't1',
            age: 30,
            preferences: {
              pace: 'relaxed',
              interests: ['nature', 'photography'],
            },
          },
        ],
        constraints: {
          budget: {
            currency: 'USD',
            amount: 5000,
          },
        },
      } as TripPlanRequest,
    },
    {
      name: '阿根廷乌斯怀亚5天行程（预算有限）',
      userInput: '去阿根廷乌斯怀亚 5 天，预算有限，希望性价比高。',
      tripPlanRequest: {
        request_id: `test-${Date.now()}-2`,
        origin: 'Shanghai',
        destination: 'Ushuaia, Argentina',
        days: 5,
        travelers: [
          {
            id: 't1',
            age: 28,
            preferences: {
              pace: 'moderate',
              interests: ['adventure', 'culture'],
            },
          },
        ],
        constraints: {
          budget: {
            currency: 'USD',
            amount: 2000,
          },
        },
      } as TripPlanRequest,
    },
  ];

  // 3. 运行测试用例
  for (const testCase of testCases) {
    console.log(`\n📋 测试用例: ${testCase.name}`);
    console.log(`用户输入: ${testCase.userInput}`);
    console.log(`目的地: ${testCase.tripPlanRequest.destination}`);
    console.log(`天数: ${testCase.tripPlanRequest.days}`);
    console.log('---\n');

    try {
      const startTime = Date.now();
      
      // 生成决策草案
      const decisionDraft = await decisionDraftGenerator.generateDecisionDraft(
        testCase.userInput,
        testCase.tripPlanRequest,
        {
          model: 'claude-3-5-sonnet',
          temperature: 0.7,
          user_mode: 'toc',
        },
      );

      const duration = Date.now() - startTime;

      // 输出结果
      console.log(`✅ 决策草案生成成功 (${duration}ms)`);
      console.log(`\n📊 决策草案摘要:`);
      console.log(`- Draft ID: ${decisionDraft.draft_id}`);
      console.log(`- Version: ${decisionDraft.version}`);
      console.log(`- 决策步骤数: ${decisionDraft.decision_steps.length}`);
      console.log(`- Step Draft 步骤数: ${decisionDraft.step_draft?.steps.length || 0}`);
      console.log(`- 用户模式: ${decisionDraft.user_mode}`);

      console.log(`\n🎯 决策步骤列表:`);
      decisionDraft.decision_steps.forEach((step, index) => {
        console.log(`\n  ${index + 1}. ${step.title} (${step.type})`);
        console.log(`     状态: ${step.status}`);
        console.log(`     置信度: ${(step.confidence * 100).toFixed(1)}%`);
        console.log(`     输入: ${step.inputs.map(i => `${i.name}=${i.value}`).join(', ')}`);
        console.log(`     输出: ${step.outputs.map(o => `${o.name}=${o.value} (${(o.confidence * 100).toFixed(1)}%)`).join(', ')}`);
        console.log(`     证据数: ${step.evidence.length}`);
        console.log(`     关联 Step Draft IDs: ${step.step_draft_ids.join(', ') || '无'}`);
      });

      console.log(`\n🔧 Step Draft 摘要:`);
      if (decisionDraft.step_draft) {
        console.log(`- Draft ID: ${decisionDraft.step_draft.draft_id}`);
        console.log(`- 步骤数: ${decisionDraft.step_draft.steps.length}`);
        console.log(`- 步骤类型: ${decisionDraft.step_draft.steps.map(s => s.step_type).join(', ')}`);
      } else {
        console.log('- Step Draft 未生成');
      }

      console.log(`\n📈 元数据:`);
      console.log(`- 创建时间: ${decisionDraft.metadata.created_at}`);
      console.log(`- 更新时间: ${decisionDraft.metadata.updated_at}`);
      console.log(`- 创建者: ${decisionDraft.metadata.created_by}`);

    } catch (error: any) {
      console.error(`❌ 测试失败: ${error.message}`);
      console.error(error.stack);
    }
  }

  // 4. 关闭应用上下文
  await app.close();
  console.log('\n✅ 测试完成');
}

// 运行测试
testDecisionDraftGenerator().catch((error) => {
  console.error('测试执行失败:', error);
  process.exit(1);
});