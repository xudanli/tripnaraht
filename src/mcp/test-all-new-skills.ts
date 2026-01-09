#!/usr/bin/env node

/**
 * 测试所有新 MCP Skills 的注册和基本功能
 * 
 * 验证以下新 Skills 是否正确注册：
 * - MCP-1: decision.stage, decision.replay
 * - MCP-2: context.compilePackage
 * - MCP-3: routePack.newSkeleton, routePack.validate, routePack.generateRegressionTests
 * - MCP-4: geo.findNearbyPOI, geo.sampleElevationProfile, geo.findCandidateWithinCorridor, geo.checkHazardZones
 * - MCP-5: hitl.createApprovalTask, hitl.resolveApprovalTask
 */

import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
process.env.MCP_MODE ??= 'true';
process.env.DISABLE_REDIS ??= 'true';
process.env.ALLOW_NO_DATABASE ??= 'true';
process.env.ENABLE_DECISION_SKILLS ??= 'true';
process.env.ENABLE_CONTEXT_ENGINE_MODULE ??= 'true';
process.env.ENABLE_FULL_PLACES_MODULE ??= 'false';
process.env.ENABLE_SKILL_SCAN_IN_CONSTRUCTOR ??= 'true';

import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { McpAppModule } from './mcp-app.module';
import { SkillsRegistryService } from '../skills/services/skills-registry.service';
import { SKILLS_REGISTRY_TOKEN } from '../skills/services/skills-registry.token';

// 新 Skills 列表
const NEW_SKILLS = [
  // MCP-1: Decision Core
  'decision.stage',
  'decision.replay',
  
  // MCP-2: Context OS
  'context.compilePackage',
  
  // MCP-3: Knowledge Pack
  'routePack.newSkeleton',
  'routePack.validate',
  'routePack.generateRegressionTests',
  
  // MCP-4: Geo/Spatial
  'geo.findNearbyPOI',
  'geo.sampleElevationProfile',
  'geo.findCandidateWithinCorridor',
  'geo.checkHazardZones',
  
  // MCP-5: HITL/Approval
  'hitl.createApprovalTask',
  'hitl.resolveApprovalTask',
];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    McpAppModule,
  ],
})
class TestAllNewSkillsModule {}

async function main() {
  console.error('🧪 Testing All New MCP Skills Registration...\n');

  let app;
  try {
    console.error('Creating application context...');
    
    // 添加超时保护
    const createPromise = NestFactory.createApplicationContext(TestAllNewSkillsModule, {
      logger: ['error', 'warn', 'log'],
    });
    
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('createApplicationContext timeout after 30s')), 30000)
    );
    
    app = await Promise.race([createPromise, timeoutPromise]);
    console.error('✅ App context created\n');

    const skillsRegistry = app.get(SKILLS_REGISTRY_TOKEN, { strict: false });
    if (!skillsRegistry) {
      console.error('❌ SkillsRegistryService not available');
      process.exit(1);
    }

    // 获取所有已注册的 Skills
    const allSkills = skillsRegistry.getAllSkills();
    console.error(`📊 Total registered skills: ${allSkills.length}\n`);

    // 检查新 Skills
    console.error('🔍 Checking new Skills registration:\n');
    const results: Array<{ name: string; registered: boolean; metadata?: any }> = [];

    for (const skillName of NEW_SKILLS) {
      const skill = skillsRegistry.getSkill(skillName);
      const registered = !!skill;
      results.push({
        name: skillName,
        registered,
        metadata: skill?.metadata,
      });

      if (registered) {
        console.error(`  ✅ ${skillName}`);
        if (skill?.metadata) {
          console.error(`     Description: ${skill.metadata.description || 'N/A'}`);
          console.error(`     Category: ${skill.metadata.category || 'N/A'}`);
        }
      } else {
        console.error(`  ❌ ${skillName} - NOT REGISTERED`);
      }
    }

    // 统计
    const registeredCount = results.filter(r => r.registered).length;
    const missingCount = results.filter(r => !r.registered).length;

    console.error(`\n📈 Summary:`);
    console.error(`  ✅ Registered: ${registeredCount}/${NEW_SKILLS.length}`);
    console.error(`  ❌ Missing: ${missingCount}/${NEW_SKILLS.length}`);

    if (missingCount > 0) {
      console.error(`\n⚠️  Missing Skills:`);
      results.filter(r => !r.registered).forEach(r => {
        console.error(`  - ${r.name}`);
      });
    }

    // 按 MCP 服务分组统计
    console.error(`\n📊 By MCP Service:`);
    const mcp1Skills = results.filter(r => r.name.startsWith('decision.'));
    const mcp2Skills = results.filter(r => r.name.startsWith('context.'));
    const mcp3Skills = results.filter(r => r.name.startsWith('routePack.'));
    const mcp4Skills = results.filter(r => r.name.startsWith('geo.'));
    const mcp5Skills = results.filter(r => r.name.startsWith('hitl.'));

    console.error(`  MCP-1 (Decision): ${mcp1Skills.filter(r => r.registered).length}/${mcp1Skills.length}`);
    console.error(`  MCP-2 (Context): ${mcp2Skills.filter(r => r.registered).length}/${mcp2Skills.length}`);
    console.error(`  MCP-3 (Knowledge Pack): ${mcp3Skills.filter(r => r.registered).length}/${mcp3Skills.length}`);
    console.error(`  MCP-4 (Geo): ${mcp4Skills.filter(r => r.registered).length}/${mcp4Skills.length}`);
    console.error(`  MCP-5 (HITL): ${mcp5Skills.filter(r => r.registered).length}/${mcp5Skills.length}`);

    // 列出所有已注册的 Skills（用于调试）
    console.error(`\n📋 All registered skills (${allSkills.length}):`);
    allSkills.forEach(skill => {
      console.error(`  - ${skill.metadata.name} (${skill.metadata.category || 'unknown'})`);
    });

    await app.close();

    if (missingCount > 0) {
      console.error('\n❌ Some skills are missing. Please check SkillsModule configuration.');
      process.exit(1);
    } else {
      console.error('\n✅ All new skills are registered successfully!');
      process.exit(0);
    }
  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
