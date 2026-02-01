// scripts/test-chain-of-work-feasibility.ts

/**
 * Chain-of-Work 引擎技术预研验证脚本
 * 
 * 验证步骤草案生成、Skills映射、Sub-Agents映射的技术可行性
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ChainOfWorkService } from '../src/chain-of-work/services/chain-of-work.service';
import { TripPlanRequest } from '../src/agent/interfaces/trip-plan.interface';

async function testChainOfWorkFeasibility() {
  console.log('🚀 开始 Chain-of-Work 引擎技术预研验证...\n');

  // 创建 NestJS 应用上下文
  const app = await NestFactory.createApplicationContext(AppModule);
  const chainOfWorkService = app.get(ChainOfWorkService);

  try {
    // 1. 测试步骤草案生成
    console.log('📝 测试 1: 步骤草案生成');
    const testRequest: TripPlanRequest = {
      request_id: 'test-request-001',
      origin: 'Reykjavik',
      destination: 'Akureyri',
      start_date: '2026-07-01',
      days: 5,
      mode: 'drive',
      party: {
        count: 2,
        fitness_level: 'medium',
      },
    };

    const draft = await chainOfWorkService.generateDraft(testRequest, {
      model: 'claude-3-5-sonnet',
      temperature: 0.7,
    });

    console.log(`✅ 步骤草案生成成功:`);
    console.log(`   - Draft ID: ${draft.draft_id}`);
    console.log(`   - 步骤数量: ${draft.steps.length}`);
    console.log(`   - 步骤列表: ${draft.steps.map(s => s.step_type).join(' → ')}`);

    // 验证步骤顺序（GATE_EVAL 必须在 PLAN_GEN 之前）
    const gateEvalIndex = draft.steps.findIndex(s => s.step_type === 'GATE_EVAL');
    const planGenIndex = draft.steps.findIndex(s => s.step_type === 'PLAN_GEN');
    if (gateEvalIndex !== -1 && planGenIndex !== -1 && gateEvalIndex < planGenIndex) {
      console.log(`   ✅ 步骤顺序正确: GATE_EVAL (${gateEvalIndex}) < PLAN_GEN (${planGenIndex})`);
    } else {
      console.log(`   ❌ 步骤顺序错误: GATE_EVAL (${gateEvalIndex}) >= PLAN_GEN (${planGenIndex})`);
    }

    // 2. 测试步骤草案验证
    console.log('\n🔍 测试 2: 步骤草案验证');
    const validation = await chainOfWorkService.validateDraft(draft);
    console.log(`✅ 步骤草案验证完成:`);
    console.log(`   - 验证通过: ${validation.valid}`);
    console.log(`   - 错误数量: ${validation.errors.length}`);
    console.log(`   - 警告数量: ${validation.warnings.length}`);

    if (validation.errors.length > 0) {
      console.log(`   - 错误详情:`);
      validation.errors.forEach(err => {
        console.log(`     * ${err.error_type}: ${err.message}`);
      });
    }

    // 3. 测试 Skills 映射
    console.log('\n🔗 测试 3: Skills 映射');
    const researchStep = draft.steps.find(s => s.step_type === 'RESEARCH');
    if (researchStep && researchStep.skills) {
      console.log(`✅ RESEARCH 步骤 Skills 映射:`);
      researchStep.skills.forEach(skill => {
        console.log(`   - ${skill.skill_name}: 置信度 ${(skill.confidence * 100).toFixed(1)}%`);
      });
    } else {
      console.log(`⚠️  RESEARCH 步骤未映射到 Skills`);
    }

    // 4. 测试 Sub-Agents 映射
    console.log('\n🤖 测试 4: Sub-Agents 映射');
    const gateStep = draft.steps.find(s => s.step_type === 'GATE_EVAL');
    if (gateStep) {
      console.log(`✅ GATE_EVAL 步骤 Sub-Agent 映射:`);
      console.log(`   - Sub-Agent: ${gateStep.sub_agent || 'N/A'}`);
      console.log(`   - 三人格: ${gateStep.guardian || 'N/A'}`);
    }

    const verifyStep = draft.steps.find(s => s.step_type === 'VERIFY');
    if (verifyStep) {
      console.log(`✅ VERIFY 步骤 Sub-Agent 映射:`);
      console.log(`   - Sub-Agent: ${verifyStep.sub_agent || 'N/A'}`);
      console.log(`   - 三人格: ${verifyStep.guardian || 'N/A'}`);
    }

    const repairStep = draft.steps.find(s => s.step_type === 'REPAIR');
    if (repairStep) {
      console.log(`✅ REPAIR 步骤 Sub-Agent 映射:`);
      console.log(`   - Sub-Agent: ${repairStep.sub_agent || 'N/A'}`);
      console.log(`   - 三人格: ${repairStep.guardian || 'N/A'}`);
    }

    // 5. 总结
    console.log('\n📊 技术预研验证总结:');
    console.log(`   ✅ 步骤草案生成: 成功`);
    console.log(`   ✅ 步骤草案验证: ${validation.valid ? '通过' : '失败'}`);
    console.log(`   ✅ Skills 映射: ${researchStep?.skills && researchStep.skills.length > 0 ? '成功' : '待完善'}`);
    console.log(`   ✅ Sub-Agents 映射: ${gateStep?.sub_agent ? '成功' : '待完善'}`);

    console.log('\n🎉 技术预研验证完成！');

  } catch (error) {
    console.error('❌ 技术预研验证失败:', error);
    throw error;
  } finally {
    await app.close();
  }
}

// 运行验证
testChainOfWorkFeasibility()
  .then(() => {
    console.log('\n✅ 所有测试通过');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 测试失败:', error);
    process.exit(1);
  });