#!/usr/bin/env node

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
  'decision.stage', 'decision.replay',
  'context.compilePackage',
  'routePack.newSkeleton', 'routePack.validate', 'routePack.generateRegressionTests',
  'geo.findNearbyPOI', 'geo.sampleElevationProfile', 'geo.findCandidateWithinCorridor', 'geo.checkHazardZones',
  'hitl.createApprovalTask', 'hitl.resolveApprovalTask',
];

async function main() {
  const { NestFactory } = await import('@nestjs/core');
  const { McpAppModule } = await import('./mcp-app.module');
  const { SKILLS_REGISTRY_TOKEN } = await import('../skills/services/skills-registry.token');
  
  console.error('Creating app context (10s timeout)...');
  const app = await Promise.race([
    NestFactory.createApplicationContext(McpAppModule, { logger: ['error', 'warn'] }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout after 10s')), 10000))
  ]).catch(e => {
    console.error('❌ Failed to create context:', e.message);
    process.exit(1);
  });
  
  console.error('✅ App context created');
  console.error('Getting registry...');
  const registry = app.get(SKILLS_REGISTRY_TOKEN, { strict: false });
  const all = registry.getAllSkills();
  console.error(`📊 Total registered skills: ${all.length}\n`);
  
  console.error('🔍 Checking new Skills registration:\n');
  const results = NEW_SKILLS.map(name => {
    const skill = registry.getSkill(name);
    return {
      name,
      registered: !!skill,
      metadata: skill?.metadata
    };
  });
  
  results.forEach(r => {
    if (r.registered) {
      console.error(`  ✅ ${r.name}`);
      if (r.metadata) {
        console.error(`     Description: ${r.metadata.description || 'N/A'}`);
        console.error(`     Category: ${r.metadata.category || 'N/A'}`);
      }
    } else {
      console.error(`  ❌ ${r.name} - NOT REGISTERED`);
    }
  });
  
  const registered = results.filter(r => r.registered).length;
  const missing = results.filter(r => !r.registered).length;
  
  console.error(`\n📈 Summary:`);
  console.error(`  ✅ Registered: ${registered}/${NEW_SKILLS.length}`);
  console.error(`  ❌ Missing: ${missing}/${NEW_SKILLS.length}`);
  
  if (missing > 0) {
    console.error(`\n⚠️  Missing Skills:`);
    results.filter(r => !r.registered).forEach(r => {
      console.error(`  - ${r.name}`);
    });
  }
  
  // 按 MCP 服务分组统计
  console.error(`\n📊 By MCP Service:`);
  const mcp1 = results.filter(r => r.name.startsWith('decision.'));
  const mcp2 = results.filter(r => r.name.startsWith('context.'));
  const mcp3 = results.filter(r => r.name.startsWith('routePack.'));
  const mcp4 = results.filter(r => r.name.startsWith('geo.'));
  const mcp5 = results.filter(r => r.name.startsWith('hitl.'));
  
  console.error(`  MCP-1 (Decision): ${mcp1.filter(r => r.registered).length}/${mcp1.length}`);
  console.error(`  MCP-2 (Context): ${mcp2.filter(r => r.registered).length}/${mcp2.length}`);
  console.error(`  MCP-3 (Knowledge Pack): ${mcp3.filter(r => r.registered).length}/${mcp3.length}`);
  console.error(`  MCP-4 (Geo): ${mcp4.filter(r => r.registered).length}/${mcp4.length}`);
  console.error(`  MCP-5 (HITL): ${mcp5.filter(r => r.registered).length}/${mcp5.length}`);
  
  await app.close();
  
  if (missing > 0) {
    console.error('\n❌ Some skills are missing. Please check SkillsModule configuration.');
    process.exit(1);
  } else {
    console.error('\n✅ All new skills are registered successfully!');
    process.exit(0);
  }
}

main().catch(e => {
  console.error('❌ Fatal error:', e);
  process.exit(1);
});
