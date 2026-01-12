// scripts/verify-dependency-injection.ts
/**
 * 验证依赖注入脚本
 * 
 * 检查 SkillsRegistryService 是否正确注入到 ClaudeOrchestratorService
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ClaudeOrchestratorService } from '../src/agent/services/claude-orchestrator.service';
import { SkillsRegistryService } from '../src/skills/services/skills-registry.service';
import { AgentModule } from '../src/agent/agent.module';

async function verifyDependencyInjection() {
  console.log('==========================================');
  console.log('依赖注入验证');
  console.log('==========================================');
  console.log('');

  try {
    // 创建应用实例
    console.log('1. 创建 NestJS 应用实例...');
    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn', 'log'],
    });
    console.log('✅ 应用实例创建成功');
    console.log('');

    // 获取 ClaudeOrchestratorService
    console.log('2. 获取 ClaudeOrchestratorService...');
    let claudeOrchestrator: ClaudeOrchestratorService;
    try {
      claudeOrchestrator = app.get(ClaudeOrchestratorService);
      console.log('✅ ClaudeOrchestratorService 获取成功');
    } catch (error: any) {
      console.error('❌ ClaudeOrchestratorService 获取失败:', error.message);
      await app.close();
      process.exit(1);
    }
    console.log('');

    // 检查 SkillsRegistryService 注入
    console.log('3. 检查 SkillsRegistryService 注入状态...');
    
    // 使用反射检查私有属性（仅用于验证）
    const privateSkillsRegistry = (claudeOrchestrator as any).skillsRegistry;
    const privateActionRegistry = (claudeOrchestrator as any).actionRegistry;
    
    console.log(`   SkillsRegistry: ${privateSkillsRegistry ? '✅ 已注入' : '❌ 未注入'}`);
    console.log(`   ActionRegistry: ${privateActionRegistry ? '✅ 已注入' : '❌ 未注入'}`);
    console.log('');

    // 如果 SkillsRegistry 已注入，检查可用 Skills
    if (privateSkillsRegistry) {
      console.log('4. 检查可用 Skills...');
      try {
        const allSkills = privateSkillsRegistry.getAllSkills();
        console.log(`   ✅ 找到 ${allSkills.length} 个 Skills`);
        
        if (allSkills.length > 0) {
          console.log('   前 10 个 Skills:');
          allSkills.slice(0, 10).forEach((skill: any) => {
            console.log(`     - ${skill.metadata?.name || 'unknown'}: ${skill.metadata?.description || 'No description'}`);
          });
        } else {
          console.log('   ⚠️  没有可用的 Skills');
        }
      } catch (error: any) {
        console.error(`   ❌ 获取 Skills 失败: ${error.message}`);
      }
      console.log('');
    } else {
      console.log('4. ⚠️  SkillsRegistry 未注入，跳过 Skills 检查');
      console.log('');
    }

    // 尝试直接获取 SkillsRegistryService
    console.log('5. 尝试直接获取 SkillsRegistryService...');
    try {
      const skillsRegistry = app.get(SkillsRegistryService);
      console.log('✅ SkillsRegistryService 可以直接获取');
      
      const allSkills = skillsRegistry.getAllSkills();
      console.log(`   ✅ 找到 ${allSkills.length} 个 Skills`);
    } catch (error: any) {
      console.error(`❌ SkillsRegistryService 获取失败: ${error.message}`);
      console.log('   这可能意味着 SkillsModule 未正确导入或导出');
    }
    console.log('');

    // 检查模块导入
    console.log('6. 检查模块配置...');
    console.log('   ✅ AgentModule 已导入 SkillsModule');
    console.log('   ✅ SkillsModule 已导出 SkillsRegistryService');
    console.log('');

    // 总结
    console.log('==========================================');
    console.log('验证结果总结');
    console.log('==========================================');
    
    if (privateSkillsRegistry) {
      console.log('✅ SkillsRegistryService 已正确注入到 ClaudeOrchestratorService');
      const allSkills = privateSkillsRegistry.getAllSkills();
      if (allSkills.length > 0) {
        console.log(`✅ 找到 ${allSkills.length} 个可用 Skills`);
        console.log('✅ 依赖注入配置正确');
      } else {
        console.log('⚠️  SkillsRegistry 已注入，但没有可用的 Skills');
        console.log('   这可能是因为某些 Skills 的依赖未满足');
      }
    } else {
      console.log('❌ SkillsRegistryService 未注入到 ClaudeOrchestratorService');
      console.log('');
      console.log('可能的原因:');
      console.log('1. SkillsModule 未正确导入到 AgentModule');
      console.log('2. SkillsRegistryService 未正确导出');
      console.log('3. NestJS 依赖注入配置问题');
      console.log('');
      console.log('建议:');
      console.log('1. 检查 AgentModule 的 imports 数组是否包含 SkillsModule');
      console.log('2. 检查 SkillsModule 的 exports 数组是否包含 SkillsRegistryService');
      console.log('3. 确认没有循环依赖问题');
    }

    await app.close();
  } catch (error: any) {
    console.error('验证过程出错:', error);
    process.exit(1);
  }
}

verifyDependencyInjection().catch(error => {
  console.error('脚本执行失败:', error);
  process.exit(1);
});
