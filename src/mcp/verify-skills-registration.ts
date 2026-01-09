#!/usr/bin/env node

/**
 * 详细验证所有新 Skills 的注册情况
 */

import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
process.env.MCP_MODE = 'true';
process.env.DISABLE_REDIS = 'true';
process.env.ALLOW_NO_DATABASE = 'true';
process.env.ENABLE_DECISION_SKILLS = 'true';
process.env.ENABLE_CONTEXT_ENGINE_MODULE = 'true';

const NEW_SKILLS = [
  // MCP-1: Decision Core
  { name: 'decision.stage', category: 'decision' },
  { name: 'decision.replay', category: 'decision' },
  
  // MCP-2: Context OS
  { name: 'context.compilePackage', category: 'rag' },
  
  // MCP-3: Knowledge Pack
  { name: 'routePack.newSkeleton', category: 'rag' },
  { name: 'routePack.validate', category: 'rag' },
  { name: 'routePack.generateRegressionTests', category: 'rag' },
  
  // MCP-4: Geo/Spatial
  { name: 'geo.findNearbyPOI', category: 'rag' },
  { name: 'geo.sampleElevationProfile', category: 'rag' },
  { name: 'geo.findCandidateWithinCorridor', category: 'rag' },
  { name: 'geo.checkHazardZones', category: 'rag' },
  
  // MCP-5: HITL/Approval
  { name: 'hitl.createApprovalTask', category: 'decision' },
  { name: 'hitl.resolveApprovalTask', category: 'decision' },
];

async function main() {
  console.error('🔍 开始验证 Skills 注册...\n');

  let app;
  try {
    const { NestFactory } = await import('@nestjs/core');
    const { McpAppModule } = await import('./mcp-app.module');
    const { SKILLS_REGISTRY_TOKEN } = await import('../skills/services/skills-registry.token');

    console.error('📦 创建应用上下文（超时 120 秒）...');
    const startTime = Date.now();
    
    app = await Promise.race([
      NestFactory.createApplicationContext(McpAppModule, { 
        logger: ['error', 'warn'] 
      }),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('应用上下文创建超时（120秒）')), 120000)
      )
    ]);

    const initTime = Date.now() - startTime;
    console.error(`✅ 应用上下文创建成功（耗时 ${initTime}ms）\n`);

    console.error('📋 获取 SkillsRegistryService...');
    const registry = app.get(SKILLS_REGISTRY_TOKEN, { strict: false });
    if (!registry) {
      throw new Error('SkillsRegistryService 不可用');
    }

    // 获取所有已注册的 Skills
    const allSkills = registry.getAllSkills();
    console.error(`📊 总共注册了 ${allSkills.length} 个 Skills\n`);

    // 列出所有已注册的 Skills（用于调试）
    console.error('📋 所有已注册的 Skills:');
    const skillMap = new Map<string, any>();
    allSkills.forEach(skill => {
      skillMap.set(skill.metadata.name, skill);
      console.error(`  - ${skill.metadata.name} (${skill.metadata.category || 'unknown'})`);
    });
    console.error('');

    // 检查新 Skills
    console.error('🔍 检查新 Skills 注册情况:\n');
    const results: Array<{ 
      name: string; 
      category: string;
      registered: boolean; 
      metadata?: any;
      issues?: string[];
    }> = [];

    for (const expectedSkill of NEW_SKILLS) {
      const skill = registry.getSkill(expectedSkill.name);
      const registered = !!skill;
      const issues: string[] = [];

      if (registered) {
        // 验证 metadata
        if (!skill.metadata) {
          issues.push('缺少 metadata');
        } else {
          if (!skill.metadata.name) {
            issues.push('metadata.name 缺失');
          }
          if (!skill.metadata.description) {
            issues.push('metadata.description 缺失');
          }
          if (skill.metadata.category !== expectedSkill.category) {
            issues.push(`category 不匹配: 期望 ${expectedSkill.category}, 实际 ${skill.metadata.category}`);
          }
        }

        // 验证 execute 方法
        if (typeof skill.execute !== 'function') {
          issues.push('execute 方法缺失或不是函数');
        }
      }

      results.push({
        name: expectedSkill.name,
        category: expectedSkill.category,
        registered,
        metadata: skill?.metadata,
        issues: issues.length > 0 ? issues : undefined,
      });

      if (registered) {
        if (issues.length > 0) {
          console.error(`  ⚠️  ${expectedSkill.name} - 已注册但有问题:`);
          issues.forEach(issue => console.error(`     - ${issue}`));
        } else {
          console.error(`  ✅ ${expectedSkill.name}`);
          if (skill?.metadata?.description) {
            console.error(`     ${skill.metadata.description.substring(0, 60)}...`);
          }
        }
      } else {
        console.error(`  ❌ ${expectedSkill.name} - 未注册`);
      }
    }

    // 统计
    const registeredCount = results.filter(r => r.registered && !r.issues).length;
    const registeredWithIssues = results.filter(r => r.registered && r.issues).length;
    const missingCount = results.filter(r => !r.registered).length;

    console.error(`\n📈 统计结果:`);
    console.error(`  ✅ 正常注册: ${registeredCount}/${NEW_SKILLS.length}`);
    console.error(`  ⚠️  已注册但有问题: ${registeredWithIssues}/${NEW_SKILLS.length}`);
    console.error(`  ❌ 未注册: ${missingCount}/${NEW_SKILLS.length}`);

    // 按 MCP 服务分组统计
    console.error(`\n📊 按 MCP 服务分组:`);
    const mcp1 = results.filter(r => r.name.startsWith('decision.'));
    const mcp2 = results.filter(r => r.name.startsWith('context.'));
    const mcp3 = results.filter(r => r.name.startsWith('routePack.'));
    const mcp4 = results.filter(r => r.name.startsWith('geo.'));
    const mcp5 = results.filter(r => r.name.startsWith('hitl.'));

    console.error(`  MCP-1 (Decision): ${mcp1.filter(r => r.registered && !r.issues).length}/${mcp1.length}`);
    console.error(`  MCP-2 (Context): ${mcp2.filter(r => r.registered && !r.issues).length}/${mcp2.length}`);
    console.error(`  MCP-3 (Knowledge Pack): ${mcp3.filter(r => r.registered && !r.issues).length}/${mcp3.length}`);
    console.error(`  MCP-4 (Geo): ${mcp4.filter(r => r.registered && !r.issues).length}/${mcp4.length}`);
    console.error(`  MCP-5 (HITL): ${mcp5.filter(r => r.registered && !r.issues).length}/${mcp5.length}`);

    // 详细问题报告
    if (missingCount > 0 || registeredWithIssues > 0) {
      console.error(`\n⚠️  问题详情:`);
      
      if (missingCount > 0) {
        console.error(`\n  未注册的 Skills:`);
        results.filter(r => !r.registered).forEach(r => {
          console.error(`    - ${r.name}`);
        });
      }

      if (registeredWithIssues > 0) {
        console.error(`\n  已注册但有问题的 Skills:`);
        results.filter(r => r.registered && r.issues).forEach(r => {
          console.error(`    - ${r.name}:`);
          r.issues!.forEach(issue => console.error(`      • ${issue}`));
        });
      }
    }

    await app.close();

    // 判断测试结果
    if (missingCount > 0 || registeredWithIssues > 0) {
      console.error('\n❌ 验证失败：部分 Skills 未注册或有问题');
      process.exit(1);
    } else {
      console.error('\n✅ 验证成功：所有新 Skills 都已正确注册！');
      process.exit(0);
    }
  } catch (error: any) {
    console.error('\n❌ 验证过程出错:');
    console.error(`   错误: ${error.message}`);
    if (error.stack) {
      console.error(`   堆栈: ${error.stack.split('\n').slice(0, 5).join('\n')}`);
    }
    if (app) {
      try {
        await app.close();
      } catch (e) {
        // 忽略关闭错误
      }
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ 致命错误:', error);
  process.exit(1);
});
