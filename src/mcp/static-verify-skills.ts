#!/usr/bin/env node

/**
 * 静态验证 Skills 配置（不启动应用上下文）
 * 检查所有新 Skills 是否在 SkillsModule 中正确配置
 */

import * as fs from 'fs';
import * as path from 'path';

const SKILLS_MODULE_PATH = path.resolve(__dirname, '../skills/skills.module.ts');
const skillsModuleContent = fs.readFileSync(SKILLS_MODULE_PATH, 'utf-8');

const NEW_SKILLS = [
  // MCP-1: Decision Core
  { name: 'decision.stage', className: 'DecisionStageSkill' },
  { name: 'decision.replay', className: 'DecisionReplaySkill' },
  
  // MCP-2: Context OS
  { name: 'context.compilePackage', className: 'ContextCompilePackageSkill' },
  
  // MCP-3: Knowledge Pack
  { name: 'routePack.newSkeleton', className: 'RoutePackNewSkeletonSkill' },
  { name: 'routePack.validate', className: 'RoutePackValidateSkill' },
  { name: 'routePack.generateRegressionTests', className: 'RoutePackGenerateRegressionTestsSkill' },
  
  // MCP-4: Geo/Spatial
  { name: 'geo.findNearbyPOI', className: 'GeoFindNearbyPOISkill' },
  { name: 'geo.sampleElevationProfile', className: 'GeoSampleElevationProfileSkill' },
  { name: 'geo.findCandidateWithinCorridor', className: 'GeoFindCandidateWithinCorridorSkill' },
  { name: 'geo.checkHazardZones', className: 'GeoCheckHazardZonesSkill' },
  
  // MCP-5: HITL/Approval
  { name: 'hitl.createApprovalTask', className: 'HitlCreateApprovalTaskSkill' },
  { name: 'hitl.resolveApprovalTask', className: 'HitlResolveApprovalTaskSkill' },
];

console.error('🔍 静态验证 Skills 配置...\n');

const results: Array<{
  name: string;
  className: string;
  inProviders: boolean;
  inExports: boolean;
  inConstructor: boolean;
  inImports: boolean;
  issues: string[];
}> = [];

for (const skill of NEW_SKILLS) {
  const issues: string[] = [];
  
  // 检查 import
  const inImports = skillsModuleContent.includes(`import { ${skill.className} }`);
  
  // 检查 providers
  const inProviders = skillsModuleContent.includes(`${skill.className},`) || 
                      skillsModuleContent.includes(`${skill.className}\n`) ||
                      new RegExp(`${skill.className}\\s*,`).test(skillsModuleContent);
  
  // 检查 exports
  const inExports = skillsModuleContent.includes(`${skill.className},`) ||
                    new RegExp(`${skill.className}\\s*,`).test(skillsModuleContent.split('exports:')[1] || '');
  
  // 检查构造函数中的注册
  const inConstructor = skillsModuleContent.includes(`registerSkill(this.${skill.className.charAt(0).toLowerCase() + skill.className.slice(1)})`) ||
                        skillsModuleContent.includes(`registerSkill(this.${skill.className})`);

  if (!inImports) {
    issues.push('未找到 import 语句');
  }
  if (!inProviders) {
    issues.push('未在 providers 中');
  }
  if (!inExports) {
    issues.push('未在 exports 中');
  }
  if (!inConstructor) {
    issues.push('未在构造函数中注册');
  }

  results.push({
    name: skill.name,
    className: skill.className,
    inImports,
    inProviders,
    inExports,
    inConstructor,
    issues,
  });
}

// 输出结果
console.error('📋 验证结果:\n');

let allPassed = true;
for (const result of results) {
  if (result.issues.length === 0) {
    console.error(`  ✅ ${result.name}`);
    console.error(`     - Import: ✅`);
    console.error(`     - Providers: ✅`);
    console.error(`     - Exports: ✅`);
    console.error(`     - Constructor: ✅`);
  } else {
    allPassed = false;
    console.error(`  ❌ ${result.name}`);
    result.issues.forEach(issue => {
      console.error(`     - ${issue}`);
    });
  }
}

// 统计
const passed = results.filter(r => r.issues.length === 0).length;
const failed = results.filter(r => r.issues.length > 0).length;

console.error(`\n📈 统计:`);
console.error(`  ✅ 通过: ${passed}/${NEW_SKILLS.length}`);
console.error(`  ❌ 失败: ${failed}/${NEW_SKILLS.length}`);

// 按 MCP 服务分组
console.error(`\n📊 按 MCP 服务分组:`);
const mcp1 = results.filter(r => r.name.startsWith('decision.'));
const mcp2 = results.filter(r => r.name.startsWith('context.'));
const mcp3 = results.filter(r => r.name.startsWith('routePack.'));
const mcp4 = results.filter(r => r.name.startsWith('geo.'));
const mcp5 = results.filter(r => r.name.startsWith('hitl.'));

console.error(`  MCP-1 (Decision): ${mcp1.filter(r => r.issues.length === 0).length}/${mcp1.length}`);
console.error(`  MCP-2 (Context): ${mcp2.filter(r => r.issues.length === 0).length}/${mcp2.length}`);
console.error(`  MCP-3 (Knowledge Pack): ${mcp3.filter(r => r.issues.length === 0).length}/${mcp3.length}`);
console.error(`  MCP-4 (Geo): ${mcp4.filter(r => r.issues.length === 0).length}/${mcp4.length}`);
console.error(`  MCP-5 (HITL): ${mcp5.filter(r => r.issues.length === 0).length}/${mcp5.length}`);

if (allPassed) {
  console.error('\n✅ 所有 Skills 配置验证通过！');
  process.exit(0);
} else {
  console.error('\n❌ 部分 Skills 配置有问题，请检查上述问题');
  process.exit(1);
}
