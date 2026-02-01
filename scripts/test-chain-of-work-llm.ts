// scripts/test-chain-of-work-llm.ts

/**
 * Chain-of-Work 引擎 LLM 调用测试脚本
 * 
 * 测试步骤草案生成的 LLM 调用，验证提示词模板和 JSON Schema
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ChainOfWorkService } from '../src/chain-of-work/services/chain-of-work.service';
import { TripPlanRequest } from '../src/agent/interfaces/trip-plan.interface';

async function testChainOfWorkLLM() {
  console.log('🚀 开始 Chain-of-Work 引擎 LLM 调用测试...\n');

  // 检查环境变量
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  console.log('📋 LLM API Key 配置检查:');
  console.log(`   - Anthropic (Claude): ${anthropicKey ? '✅ 已配置' : '❌ 未配置'}`);
  console.log(`   - OpenAI: ${openaiKey ? '✅ 已配置' : '❌ 未配置'}`);
  console.log(`   - DeepSeek: ${deepseekKey ? '✅ 已配置' : '❌ 未配置'}`);
  console.log(`   - Gemini: ${geminiKey ? '✅ 已配置' : '❌ 未配置'}\n`);

  if (!anthropicKey && !openaiKey && !deepseekKey && !geminiKey) {
    console.error('❌ 错误: 未找到任何 LLM API Key');
    console.error('   请在 .env 文件中配置以下任一 API Key:');
    console.error('   - ANTHROPIC_API_KEY (推荐用于 Claude)');
    console.error('   - OPENAI_API_KEY');
    console.error('   - DEEPSEEK_API_KEY');
    console.error('   - GEMINI_API_KEY');
    process.exit(1);
  }

  // 创建 NestJS 应用上下文
  const app = await NestFactory.createApplicationContext(AppModule);
  const chainOfWorkService = app.get(ChainOfWorkService);

  try {
    // 测试用例 1: 简单自驾行程
    console.log('📝 测试用例 1: 简单自驾行程（冰岛）');
    const testRequest1: TripPlanRequest = {
      request_id: 'test-llm-001',
      origin: 'Reykjavik',
      destination: 'Akureyri',
      start_date: '2026-07-01',
      days: 3,
      mode: 'drive',
      party: {
        count: 2,
        fitness_level: 'medium',
      },
    };

    console.log('   请求参数:', JSON.stringify(testRequest1, null, 2));
    console.log('   使用模型: claude-3-5-sonnet\n');

    const startTime1 = Date.now();
    const draft1 = await chainOfWorkService.generateDraft(testRequest1, {
      model: 'claude-3-5-sonnet',
      temperature: 0.7,
    });
    const duration1 = Date.now() - startTime1;

    console.log(`✅ 步骤草案生成成功 (耗时: ${duration1}ms):`);
    console.log(`   - Draft ID: ${draft1.draft_id}`);
    console.log(`   - 步骤数量: ${draft1.steps.length}`);
    console.log(`   - 步骤列表:`);
    draft1.steps.forEach((step, index) => {
      console.log(`     ${index + 1}. [${step.step_type}] ${step.title}`);
      if (step.description) {
        console.log(`        描述: ${step.description.substring(0, 60)}...`);
      }
      if (step.skills && step.skills.length > 0) {
        console.log(`        Skills: ${step.skills.map(s => s.skill_name).join(', ')}`);
      }
      if (step.sub_agent) {
        console.log(`        Sub-Agent: ${step.sub_agent}`);
      }
      if (step.guardian) {
        console.log(`        三人格: ${step.guardian}`);
      }
    });

    // 验证步骤顺序
    const gateEvalIndex1 = draft1.steps.findIndex(s => s.step_type === 'GATE_EVAL');
    const planGenIndex1 = draft1.steps.findIndex(s => s.step_type === 'PLAN_GEN');
    if (gateEvalIndex1 !== -1 && planGenIndex1 !== -1 && gateEvalIndex1 < planGenIndex1) {
      console.log(`\n   ✅ 步骤顺序正确: GATE_EVAL (${gateEvalIndex1}) < PLAN_GEN (${planGenIndex1})`);
    } else {
      console.log(`\n   ❌ 步骤顺序错误: GATE_EVAL (${gateEvalIndex1}) >= PLAN_GEN (${planGenIndex1})`);
    }

    // 验证步骤完整性
    const requiredSteps = ['INTAKE', 'RESEARCH', 'GATE_EVAL', 'PLAN_GEN', 'VERIFY', 'REPAIR', 'NARRATE', 'DONE'];
    const missingSteps1 = requiredSteps.filter(step => !draft1.steps.some(s => s.step_type === step));
    if (missingSteps1.length === 0) {
      console.log(`   ✅ 步骤完整性: 所有必需步骤都已包含`);
    } else {
      console.log(`   ⚠️  步骤完整性: 缺少步骤 ${missingSteps1.join(', ')}`);
    }

    // 测试用例 2: 复杂徒步行程
    console.log('\n\n📝 测试用例 2: 复杂徒步行程（冰岛高地）');
    const testRequest2: TripPlanRequest = {
      request_id: 'test-llm-002',
      origin: 'Landmannalaugar',
      destination: 'Þórsmörk',
      start_date: '2026-08-01',
      days: 5,
      mode: 'walk',
      party: {
        count: 4,
        fitness_level: 'high',
      },
      constraints: {
        max_ascent_m: 1500,
        max_walk_km: 25,
      },
    };

    console.log('   请求参数:', JSON.stringify(testRequest2, null, 2));
    console.log('   使用模型: claude-3-5-sonnet\n');

    const startTime2 = Date.now();
    const draft2 = await chainOfWorkService.generateDraft(testRequest2, {
      model: 'claude-3-5-sonnet',
      temperature: 0.7,
    });
    const duration2 = Date.now() - startTime2;

    console.log(`✅ 步骤草案生成成功 (耗时: ${duration2}ms):`);
    console.log(`   - Draft ID: ${draft2.draft_id}`);
    console.log(`   - 步骤数量: ${draft2.steps.length}`);
    console.log(`   - 步骤列表:`);
    draft2.steps.forEach((step, index) => {
      console.log(`     ${index + 1}. [${step.step_type}] ${step.title}`);
      if (step.description) {
        console.log(`        描述: ${step.description.substring(0, 60)}...`);
      }
    });

    // 验证步骤顺序
    const gateEvalIndex2 = draft2.steps.findIndex(s => s.step_type === 'GATE_EVAL');
    const planGenIndex2 = draft2.steps.findIndex(s => s.step_type === 'PLAN_GEN');
    if (gateEvalIndex2 !== -1 && planGenIndex2 !== -1 && gateEvalIndex2 < planGenIndex2) {
      console.log(`\n   ✅ 步骤顺序正确: GATE_EVAL (${gateEvalIndex2}) < PLAN_GEN (${planGenIndex2})`);
    } else {
      console.log(`\n   ❌ 步骤顺序错误: GATE_EVAL (${gateEvalIndex2}) >= PLAN_GEN (${planGenIndex2})`);
    }

    // 测试用例 3: 验证步骤草案
    console.log('\n\n🔍 测试用例 3: 步骤草案验证');
    const validation = await chainOfWorkService.validateDraft(draft1);
    console.log(`✅ 步骤草案验证完成:`);
    console.log(`   - 验证通过: ${validation.valid ? '✅' : '❌'}`);
    console.log(`   - 错误数量: ${validation.errors.length}`);
    console.log(`   - 警告数量: ${validation.warnings.length}`);

    if (validation.errors.length > 0) {
      console.log(`\n   ❌ 错误详情:`);
      validation.errors.forEach(err => {
        console.log(`     * [${err.error_type}] ${err.message}`);
        if (err.suggestion) {
          console.log(`       建议: ${err.suggestion}`);
        }
      });
    }

    if (validation.warnings.length > 0) {
      console.log(`\n   ⚠️  警告详情:`);
      validation.warnings.forEach(warn => {
        console.log(`     * [${warn.warning_type}] ${warn.message}`);
      });
    }

    // 总结
    console.log('\n\n📊 LLM 调用测试总结:');
    console.log(`   ✅ 测试用例 1 (简单自驾): ${duration1}ms`);
    console.log(`   ✅ 测试用例 2 (复杂徒步): ${duration2}ms`);
    console.log(`   ✅ 步骤草案验证: ${validation.valid ? '通过' : '失败'}`);
    console.log(`   ✅ 平均响应时间: ${((duration1 + duration2) / 2).toFixed(0)}ms`);

    console.log('\n🎉 LLM 调用测试完成！');

  } catch (error: any) {
    console.error('\n❌ LLM 调用测试失败:', error.message);
    if (error.stack) {
      console.error('\n错误堆栈:', error.stack);
    }
    throw error;
  } finally {
    await app.close();
  }
}

// 运行测试
testChainOfWorkLLM()
  .then(() => {
    console.log('\n✅ 所有测试通过');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 测试失败:', error);
    process.exit(1);
  });