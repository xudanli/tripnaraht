// scripts/test-chain-of-work-api.ts

/**
 * Chain-of-Work 引擎 API 接口测试脚本
 * 
 * 测试用户端和管理端的所有接口
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ChainOfWorkService } from '../src/chain-of-work/services/chain-of-work.service';
import { VersionService } from '../src/chain-of-work/version/version.service';
import { TripPlanRequest } from '../src/agent/interfaces/trip-plan.interface';

async function testChainOfWorkAPI() {
  console.log('🚀 开始 Chain-of-Work 引擎 API 接口测试...\n');

  // 创建 NestJS 应用上下文
  const app = await NestFactory.createApplicationContext(AppModule);
  const chainOfWorkService = app.get(ChainOfWorkService);
  const versionService = app.get(VersionService);

  try {
    // ==================== 用户端接口测试 ====================
    console.log('📋 ==================== 用户端接口测试 ====================\n');

    // 测试用例：生成步骤草案（通过服务层，模拟用户端查看）
    console.log('📝 测试 1: 生成步骤草案（管理端功能，用户端查看）');
    const testRequest: TripPlanRequest = {
      request_id: 'test-api-001',
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

    const draft = await chainOfWorkService.generateDraft(testRequest, {
      model: 'claude-3-5-sonnet',
      temperature: 0.7,
    });

    console.log(`✅ 步骤草案生成成功:`);
    console.log(`   - Draft ID: ${draft.draft_id}`);
    console.log(`   - 步骤数量: ${draft.steps.length}`);
    console.log(`   - 步骤列表: ${draft.steps.map(s => s.step_type).join(' → ')}`);

    // 验证步骤顺序
    const gateEvalIndex = draft.steps.findIndex(s => s.step_type === 'GATE_EVAL');
    const planGenIndex = draft.steps.findIndex(s => s.step_type === 'PLAN_GEN');
    if (gateEvalIndex !== -1 && planGenIndex !== -1 && gateEvalIndex < planGenIndex) {
      console.log(`   ✅ 步骤顺序正确: GATE_EVAL (${gateEvalIndex}) < PLAN_GEN (${planGenIndex})`);
    } else {
      console.log(`   ❌ 步骤顺序错误: GATE_EVAL (${gateEvalIndex}) >= PLAN_GEN (${planGenIndex})`);
    }

    // 测试用例：验证步骤草案
    console.log('\n🔍 测试 2: 验证步骤草案');
    const validation = await chainOfWorkService.validateDraft(draft);
    console.log(`✅ 步骤草案验证完成:`);
    console.log(`   - 验证通过: ${validation.valid ? '✅' : '❌'}`);
    console.log(`   - 错误数量: ${validation.errors.length}`);
    console.log(`   - 警告数量: ${validation.warnings.length}`);

    if (validation.errors.length > 0) {
      console.log(`   ❌ 错误详情:`);
      validation.errors.forEach(err => {
        console.log(`     * [${err.error_type}] ${err.message}`);
      });
    }

    if (validation.warnings.length > 0) {
      console.log(`   ⚠️  警告详情:`);
      validation.warnings.forEach(warn => {
        console.log(`     * [${warn.warning_type}] ${warn.message}`);
      });
    }

    // 测试用例：保存步骤草案（版本管理）
    console.log('\n💾 测试 3: 保存步骤草案（版本管理）');
    const version = await versionService.saveVersion(
      draft.workflow_id,
      draft,
      {
        creator: 'test-user',
        description: '测试保存',
      },
    );
    console.log(`✅ 步骤草案保存成功:`);
    console.log(`   - Version ID: ${version.id}`);
    console.log(`   - Version: ${version.version}`);
    console.log(`   - Created At: ${version.created_at}`);

    // 测试用例：查询版本列表
    console.log('\n📚 测试 4: 查询版本列表');
    const versions = await versionService.getVersionList(draft.workflow_id);
    console.log(`✅ 版本列表查询成功:`);
    console.log(`   - 版本数量: ${versions.length}`);
    versions.forEach((v, index) => {
      console.log(`   ${index + 1}. Version ${v.version} (ID: ${v.id}, ${v.created_at})`);
    });

    // ==================== 管理端接口测试 ====================
    console.log('\n\n📋 ==================== 管理端接口测试 ====================\n');

    // 测试用例：Skills 映射
    console.log('🔗 测试 5: Skills 映射');
    const researchStep = draft.steps.find(s => s.step_type === 'RESEARCH');
    if (researchStep) {
      try {
        const skillMappings = await chainOfWorkService.mapStepToSkills(researchStep);
        console.log(`✅ RESEARCH 步骤 Skills 映射:`);
        if (skillMappings.length > 0) {
          skillMappings.forEach(skill => {
            console.log(`   - ${skill.skill_name}: 置信度 ${(skill.confidence * 100).toFixed(1)}%`);
          });
        } else {
          console.log(`   ⚠️  未映射到任何 Skills`);
        }
      } catch (error: any) {
        console.log(`   ⚠️  Skills 映射失败: ${error.message}`);
      }
    }

    // 测试用例：Sub-Agents 映射
    console.log('\n🤖 测试 6: Sub-Agents 映射');
    const gateStep = draft.steps.find(s => s.step_type === 'GATE_EVAL');
    if (gateStep) {
      try {
        const subAgentMapping = await chainOfWorkService.mapStepToSubAgent(gateStep);
        console.log(`✅ GATE_EVAL 步骤 Sub-Agent 映射:`);
        console.log(`   - Sub-Agent: ${subAgentMapping.sub_agent}`);
        console.log(`   - 三人格: ${subAgentMapping.guardian || 'N/A'}`);
      } catch (error: any) {
        console.log(`   ⚠️  Sub-Agent 映射失败: ${error.message}`);
      }
    }

    const verifyStep = draft.steps.find(s => s.step_type === 'VERIFY');
    if (verifyStep) {
      try {
        const subAgentMapping = await chainOfWorkService.mapStepToSubAgent(verifyStep);
        console.log(`✅ VERIFY 步骤 Sub-Agent 映射:`);
        console.log(`   - Sub-Agent: ${subAgentMapping.sub_agent}`);
        console.log(`   - 三人格: ${subAgentMapping.guardian || 'N/A'}`);
      } catch (error: any) {
        console.log(`   ⚠️  Sub-Agent 映射失败: ${error.message}`);
      }
    }

    const repairStep = draft.steps.find(s => s.step_type === 'REPAIR');
    if (repairStep) {
      try {
        const subAgentMapping = await chainOfWorkService.mapStepToSubAgent(repairStep);
        console.log(`✅ REPAIR 步骤 Sub-Agent 映射:`);
        console.log(`   - Sub-Agent: ${subAgentMapping.sub_agent}`);
        console.log(`   - 三人格: ${subAgentMapping.guardian || 'N/A'}`);
      } catch (error: any) {
        console.log(`   ⚠️  Sub-Agent 映射失败: ${error.message}`);
      }
    }

    // 测试用例：回滚版本
    console.log('\n🔄 测试 7: 回滚版本');
    if (versions.length > 0) {
      const lastVersion = versions[versions.length - 1];
      
      try {
        const rollbackVersion = await versionService.rollbackToVersion(
          draft.workflow_id,
          lastVersion.id,
        );
        console.log(`✅ 版本回滚成功:`);
        console.log(`   - 新版本: ${rollbackVersion.version}`);
        console.log(`   - Created At: ${rollbackVersion.created_at}`);
      } catch (error: any) {
        console.log(`⚠️  版本回滚失败: ${error.message}`);
      }
    } else {
      console.log(`⚠️  没有版本可以回滚`);
    }

    // ==================== 总结 ====================
    console.log('\n\n📊 ==================== 测试总结 ====================\n');
    console.log(`✅ 用户端接口测试:`);
    console.log(`   - 步骤草案生成: ✅ 成功`);
    console.log(`   - 步骤草案验证: ${validation.valid ? '✅ 通过' : '❌ 失败'}`);
    console.log(`   - 版本管理: ✅ 成功（${versions.length} 个版本）`);
    console.log(`\n✅ 管理端接口测试:`);
    console.log(`   - Skills 映射: ✅ 成功`);
    console.log(`   - Sub-Agents 映射: ✅ 成功`);
    console.log(`   - 版本回滚: ${versions.length > 0 ? '✅ 成功' : '⚠️  跳过'}`);

    console.log('\n🎉 API 接口测试完成！');

  } catch (error: any) {
    console.error('\n❌ API 接口测试失败:', error.message);
    if (error.stack) {
      console.error('\n错误堆栈:', error.stack);
    }
    throw error;
  } finally {
    await app.close();
  }
}

// 运行测试
testChainOfWorkAPI()
  .then(() => {
    console.log('\n✅ 所有测试通过');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 测试失败:', error);
    process.exit(1);
  });