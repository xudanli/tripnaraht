// scripts/test-decision-draft-api.ts

/**
 * 测试 Decision Draft API
 * 
 * 测试决策草案的生成、编辑、解释、版本管理等 API 接口
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DecisionDraftGeneratorService } from '../src/decision-draft/services/decision-draft-generator.service';
import { DecisionDraftStorageService } from '../src/decision-draft/storage/decision-draft-storage.service';
import { DecisionDraftEditorService } from '../src/decision-draft/services/decision-draft-editor.service';
import { DecisionExplanationService } from '../src/decision-draft/services/decision-explanation.service';
import { DecisionDraftVersionService } from '../src/decision-draft/services/decision-draft-version.service';
import { TripPlanRequest } from '../src/agent/interfaces/trip-plan.interface';

async function testDecisionDraftAPI() {
  console.log('🚀 开始测试 Decision Draft API...\n');

  // 1. 创建 NestJS 应用上下文
  const app = await NestFactory.createApplicationContext(AppModule);
  const generator = app.get(DecisionDraftGeneratorService);
  const storage = app.get(DecisionDraftStorageService);
  const editor = app.get(DecisionDraftEditorService);
  const explanation = app.get(DecisionExplanationService);
  const versionService = app.get(DecisionDraftVersionService);

  // 2. 准备测试用例
  const userInput = '我们 3 个人，去冰岛 7 天，不想太赶，但想去高地。';
  const tripPlanRequest: TripPlanRequest = {
    request_id: `test-${Date.now()}`,
    origin: 'Beijing',
    destination: 'Iceland',
    days: 7,
    party: {
      count: 3,
      fitness_level: 'medium',
    },
    constraints: {
      budget: {
        currency: 'USD',
        total: 5000,
      },
    },
  };

  try {
    // 3. 测试生成决策草案
    console.log('📋 测试 1: 生成决策草案');
    const startTime = Date.now();
    const decisionDraft = await generator.generateDecisionDraft(
      userInput,
      tripPlanRequest,
      {
        model: 'claude-3-5-sonnet',
        temperature: 0.7,
        user_mode: 'toc',
      },
    );
    const generationTime = Date.now() - startTime;
    console.log(`✅ 决策草案生成成功 (${generationTime}ms)`);
    console.log(`   - Draft ID: ${decisionDraft.draft_id}`);
    console.log(`   - 决策步骤数: ${decisionDraft.decision_steps.length}`);
    console.log(`   - Step Draft 步骤数: ${decisionDraft.step_draft?.steps.length || 0}\n`);

    // 4. 测试保存到数据库
    console.log('💾 测试 2: 保存决策草案到数据库');
    const savedDraft = await storage.saveDecisionDraft(decisionDraft);
    console.log(`✅ 决策草案保存成功`);
    console.log(`   - Draft ID: ${savedDraft.draft_id}\n`);

    // 5. 测试从数据库加载
    console.log('📥 测试 3: 从数据库加载决策草案');
    const loadedDraft = await storage.loadDecisionDraft(savedDraft.draft_id);
    if (loadedDraft) {
      console.log(`✅ 决策草案加载成功`);
      console.log(`   - Draft ID: ${loadedDraft.draft_id}`);
      console.log(`   - 决策步骤数: ${loadedDraft.decision_steps.length}\n`);
    } else {
      console.log(`❌ 决策草案加载失败\n`);
    }

    // 6. 测试编辑决策步骤
    if (loadedDraft && loadedDraft.decision_steps.length > 0) {
      console.log('✏️ 测试 4: 编辑决策步骤');
      const firstStep = loadedDraft.decision_steps[0];
      const editedDraft = await editor.editDecisionStep(loadedDraft, {
        decision_step_id: firstStep.id,
        action: 'approve',
        reasoning: '测试批准',
      });
      console.log(`✅ 决策步骤编辑成功`);
      console.log(`   - 步骤状态: ${editedDraft.decision_steps[0].status}\n`);

      // 保存编辑后的草案
      await storage.saveDecisionDraft(editedDraft);
    }

    // 7. 测试生成解释（ToC 模式）
    if (loadedDraft) {
      console.log('📖 测试 5: 生成决策解释（ToC 模式）');
      const tocExplanation = await explanation.generateExplanation(loadedDraft, 'toc');
      console.log(`✅ ToC 解释生成成功`);
      console.log(`   - 摘要: ${(tocExplanation as any).summary}`);
      console.log(`   - 关键决策数: ${(tocExplanation as any).key_decisions.length}\n`);
    }

    // 8. 测试生成解释（Expert 模式）
    if (loadedDraft) {
      console.log('📚 测试 6: 生成决策解释（Expert 模式）');
      const expertExplanation = await explanation.generateExplanation(loadedDraft, 'expert');
      console.log(`✅ Expert 解释生成成功`);
      console.log(`   - 决策步骤数: ${(expertExplanation as any).decision_steps.length}`);
      console.log(`   - Step Drafts 数: ${(expertExplanation as any).step_drafts.length}`);
      console.log(`   - 证据链长度: ${(expertExplanation as any).evidence_chain.length}\n`);
    }

    // 9. 测试保存版本
    if (loadedDraft) {
      console.log('📦 测试 7: 保存版本');
      const version = await versionService.saveVersion(loadedDraft, {
        creator: 'test-user',
        description: '测试版本',
      });
      console.log(`✅ 版本保存成功`);
      console.log(`   - Version ID: ${version.version_id}`);
      console.log(`   - Version: ${version.version}\n`);
    }

    // 10. 测试加载版本列表
    if (loadedDraft) {
      console.log('📋 测试 8: 加载版本列表');
      const versions = await versionService.getVersions(loadedDraft.workflow_id);
      console.log(`✅ 版本列表加载成功`);
      console.log(`   - 版本数: ${versions.length}\n`);
    }

    // 11. 测试局部重算
    if (loadedDraft && loadedDraft.decision_steps.length > 0) {
      console.log('🔄 测试 9: 局部重算');
      // 先拒绝一个步骤
      const firstStep = loadedDraft.decision_steps[0];
      const rejectedDraft = await editor.editDecisionStep(loadedDraft, {
        decision_step_id: firstStep.id,
        action: 'reject',
        reasoning: '测试拒绝',
      });
      await storage.saveDecisionDraft(rejectedDraft);

      // 然后进行局部重算
      const regeneratedDraft = await editor.partialRegenerate(rejectedDraft, {
        regenerate_decision_steps: true,
        regenerate_step_drafts: true,
        preserve_approved_decisions: true,
        original_user_input: userInput,
        original_trip_plan_request: tripPlanRequest,
      });
      console.log(`✅ 局部重算成功`);
      console.log(`   - 决策步骤数: ${regeneratedDraft.decision_steps.length}\n`);
    }

    console.log('✅ 所有测试完成');

  } catch (error: any) {
    console.error(`❌ 测试失败: ${error.message}`);
    console.error(error.stack);
  } finally {
    // 关闭应用上下文
    await app.close();
  }
}

// 运行测试
testDecisionDraftAPI().catch((error) => {
  console.error('测试执行失败:', error);
  process.exit(1);
});
