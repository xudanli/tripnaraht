#!/usr/bin/env node
/**
 * 测试 Decision MCP Skills
 * 
 * 验证 decision.stage 和 decision.replay 是否正确注册和可用
 */

import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
process.env.MCP_MODE ??= 'true';
process.env.DISABLE_REDIS ??= 'true';
process.env.ALLOW_NO_DATABASE ??= 'true';
process.env.ENABLE_DECISION_SKILLS ??= 'true';

import { NestFactory } from '@nestjs/core';
import { McpAppModule } from './mcp-app.module';
import { SKILLS_REGISTRY_TOKEN } from '../skills/services/skills-registry.token';

async function main() {
  console.error('🧪 Testing Decision MCP Skills...\n');

  try {
    // 创建应用上下文
    const app = await NestFactory.createApplicationContext(McpAppModule, {
      logger: ['error', 'warn', 'log'],
    });

    console.error('✅ App context created');

    // 获取 SkillsRegistry
    const skillsRegistry = app.get(SKILLS_REGISTRY_TOKEN, { strict: false });
    if (!skillsRegistry) {
      throw new Error('SkillsRegistryService not found');
    }

    console.error('✅ Got SkillsRegistryService\n');

    // 获取所有 Skills
    const allSkills = skillsRegistry.getAllSkills();
    console.error(`📋 Found ${allSkills.length} total skills\n`);

    // 查找 Decision Skills
    const decisionSkills = allSkills.filter(
      (skill) => skill.metadata.name.startsWith('decision.')
    );

    console.error(`🎯 Decision Skills (${decisionSkills.length}):`);
    for (const skill of decisionSkills) {
      const toolName = `tripnara.${skill.metadata.name}`;
      console.error(`  ✓ ${toolName}`);
      console.error(`    Description: ${skill.metadata.description}`);
      console.error(`    Category: ${skill.metadata.category}`);
      console.error(`    Version: ${skill.metadata.version}`);
      console.error('');
    }

    // 检查新 Skills
    const stageSkill = decisionSkills.find((s) => s.metadata.name === 'decision.stage');
    const replaySkill = decisionSkills.find((s) => s.metadata.name === 'decision.replay');
    const logAppendSkill = decisionSkills.find((s) => s.metadata.name === 'decision.logAppend');

    console.error('🔍 Checking Decision Skills:');
    console.error(`  decision.logAppend: ${logAppendSkill ? '✅ Found' : '❌ Not found'}`);
    console.error(`  decision.stage: ${stageSkill ? '✅ Found' : '❌ Not found'}`);
    console.error(`  decision.replay: ${replaySkill ? '✅ Found' : '❌ Not found'}`);

    if (stageSkill && replaySkill) {
      console.error('\n✅ SUCCESS: Both new Decision Skills are registered!');
      
      // 显示工具名称
      console.error('\n📋 MCP Tool Names:');
      console.error(`  - tripnara.decision.logAppend`);
      console.error(`  - tripnara.decision.stage`);
      console.error(`  - tripnara.decision.replay`);
    } else {
      console.error('\n❌ FAILED: Some Decision Skills are missing');
      if (!stageSkill) console.error('  Missing: decision.stage');
      if (!replaySkill) console.error('  Missing: decision.replay');
      process.exit(1);
    }

    // 测试 decision.stage 的基本功能（如果有数据）
    if (stageSkill) {
      console.error('\n🧪 Testing decision.stage...');
      try {
        const result = await stageSkill.execute({
          limit: 10,
        });
        console.error('✅ decision.stage executed successfully');
        console.error(`   Summary: ${JSON.stringify(result.summary, null, 2)}`);
      } catch (error: any) {
        console.error(`⚠️  decision.stage test error: ${error.message}`);
        // 不失败，因为可能没有数据
      }
    }

    await app.close();
  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
