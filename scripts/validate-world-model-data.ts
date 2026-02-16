/**
 * 世界模型数据校验服务
 * 
 * 功能：
 * 1. 检查所有世界模型层的数据完整性
 * 2. 验证数据质量和一致性
 * 3. 生成校验报告
 * 
 * 使用方法：
 *   npx ts-node scripts/validate-world-model-data.ts
 *   npx ts-node scripts/validate-world-model-data.ts --json  # 输出 JSON 格式
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface ValidationResult {
  layer: string;
  table: string;
  metric: string;
  value: number;
  threshold: number;
  status: 'PASS' | 'WARN' | 'FAIL';
  message: string;
}

const results: ValidationResult[] = [];

function addResult(
  layer: string,
  table: string,
  metric: string,
  value: number,
  threshold: number,
  operator: '>' | '<' | '>=' | '<=' | '=',
  message: string
) {
  let status: 'PASS' | 'WARN' | 'FAIL';
  
  switch (operator) {
    case '>':
      status = value > threshold ? 'PASS' : value > threshold * 0.8 ? 'WARN' : 'FAIL';
      break;
    case '>=':
      status = value >= threshold ? 'PASS' : value >= threshold * 0.8 ? 'WARN' : 'FAIL';
      break;
    case '<':
      status = value < threshold ? 'PASS' : value < threshold * 1.2 ? 'WARN' : 'FAIL';
      break;
    case '<=':
      status = value <= threshold ? 'PASS' : value <= threshold * 1.2 ? 'WARN' : 'FAIL';
      break;
    case '=':
      status = value === threshold ? 'PASS' : 'FAIL';
      break;
  }
  
  results.push({ layer, table, metric, value, threshold, status, message });
}

async function validatePhysicalReality() {
  console.log('\n📍 检查 Physical Reality 层...');
  
  // Place 数据
  const placeStats = await prisma.$queryRaw<any[]>`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN location IS NOT NULL THEN 1 END) as with_location,
      COUNT(CASE WHEN "physicalMetadata" IS NOT NULL THEN 1 END) as with_metadata
    FROM "Place"
  `;
  const ps = placeStats[0];
  const locationRate = Number(ps.with_location) / Number(ps.total) * 100;
  const metadataRate = Number(ps.with_metadata) / Number(ps.total) * 100;
  
  addResult('Physical', 'Place', '坐标完整率', locationRate, 90, '>=', 
    `${ps.with_location}/${ps.total} 地点有坐标`);
  addResult('Physical', 'Place', '物理元数据完整率', metadataRate, 80, '>=',
    `${ps.with_metadata}/${ps.total} 地点有物理元数据`);
  
  // Trail 数据
  const trailCount = await prisma.$queryRaw<any[]>`SELECT COUNT(*) as c FROM "Trail"`;
  addResult('Physical', 'Trail', '徒步线路数', Number(trailCount[0].c), 20, '>=',
    `共 ${trailCount[0].c} 条徒步线路`);
  
  // hazard_zones 数据
  const hazardCount = await prisma.$queryRaw<any[]>`SELECT COUNT(*) as c FROM hazard_zones`;
  addResult('Physical', 'hazard_zones', '风险区域数', Number(hazardCount[0].c), 50, '>=',
    `共 ${hazardCount[0].c} 条风险区域`);
  
  // 天气预警
  const weatherCount = await prisma.$queryRaw<any[]>`
    SELECT COUNT(*) as c FROM realtime_weather_alerts WHERE end_time > NOW()
  `;
  addResult('Physical', 'realtime_weather_alerts', '有效天气预警', Number(weatherCount[0].c), 0, '>=',
    `当前 ${weatherCount[0].c} 条有效预警`);
}

async function validateHumanCapability() {
  console.log('\n👤 检查 Human Capability 层...');
  
  // 用户体力档案
  const fitnessCount = await prisma.$queryRaw<any[]>`
    SELECT COUNT(*) as c FROM user_fitness_profile_snapshot
  `;
  addResult('Human', 'user_fitness_profile_snapshot', '体力档案数', Number(fitnessCount[0].c), 1, '>=',
    `共 ${fitnessCount[0].c} 个用户档案`);
  
  // 用户数
  const userCount = await prisma.$queryRaw<any[]>`SELECT COUNT(*) as c FROM users`;
  const coverageRate = Number(fitnessCount[0].c) / Number(userCount[0].c) * 100;
  addResult('Human', 'fitness_coverage', '体力档案覆盖率', coverageRate, 80, '>=',
    `${fitnessCount[0].c}/${userCount[0].c} 用户有体力档案`);
}

async function validateRouteDirection() {
  console.log('\n🛤️ 检查 Route Direction 层...');
  
  const routeStats = await prisma.$queryRaw<any[]>`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN seasonality IS NOT NULL AND seasonality != '{}' THEN 1 END) as with_season,
      COUNT(CASE WHEN "riskProfile" IS NOT NULL AND "riskProfile\" != '{}' THEN 1 END) as with_risk,
      COUNT(CASE WHEN description IS NOT NULL AND description != '' THEN 1 END) as with_desc
    FROM "RouteDirection"
  `;
  const rs = routeStats[0];
  
  addResult('Route', 'RouteDirection', '路线总数', Number(rs.total), 30, '>=',
    `共 ${rs.total} 条路线`);
  addResult('Route', 'RouteDirection', '季节性完整率', 
    Number(rs.with_season) / Number(rs.total) * 100, 90, '>=',
    `${rs.with_season}/${rs.total} 有季节性数据`);
  addResult('Route', 'RouteDirection', '风险档案完整率',
    Number(rs.with_risk) / Number(rs.total) * 100, 90, '>=',
    `${rs.with_risk}/${rs.total} 有风险档案`);
  addResult('Route', 'RouteDirection', '描述完整率',
    Number(rs.with_desc) / Number(rs.total) * 100, 80, '>=',
    `${rs.with_desc}/${rs.total} 有描述`);
}

async function validateKnowledgeBase() {
  console.log('\n📚 检查 RAG 知识库层...');
  
  const chunkStats = await prisma.$queryRaw<any[]>`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as with_embedding
    FROM chunks
  `;
  const cs = chunkStats[0];
  
  addResult('RAG', 'chunks', '知识块总数', Number(cs.total), 500, '>=',
    `共 ${cs.total} 个知识块`);
  addResult('RAG', 'chunks', '向量嵌入完整率',
    Number(cs.with_embedding) / Number(cs.total) * 100, 95, '>=',
    `${cs.with_embedding}/${cs.total} 有向量嵌入`);
  
  // Place-KB 关联
  const placeKbCount = await prisma.$queryRaw<any[]>`
    SELECT COUNT(*) as c FROM "Place" WHERE metadata->'knowledgeBase' IS NOT NULL
  `;
  addResult('RAG', 'Place-KB', '地点-知识库关联数', Number(placeKbCount[0].c), 100, '>=',
    `${placeKbCount[0].c} 个地点已关联知识库`);
}

async function validateDecisionSupport() {
  console.log('\n🎯 检查决策支持层...');
  
  // 决策日志
  const decisionLogCount = await prisma.$queryRaw<any[]>`SELECT COUNT(*) as c FROM decision_logs`;
  addResult('Decision', 'decision_logs', '决策日志数', Number(decisionLogCount[0].c), 0, '>=',
    `共 ${decisionLogCount[0].c} 条决策日志`);
  
  // 世界模型版本
  const versionCount = await prisma.$queryRaw<any[]>`SELECT COUNT(*) as c FROM world_model_versions`;
  addResult('Decision', 'world_model_versions', '模型版本数', Number(versionCount[0].c), 0, '>=',
    `共 ${versionCount[0].c} 个模型版本`);
}

async function main() {
  const isJsonOutput = process.argv.includes('--json');
  
  if (!isJsonOutput) {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║              世界模型数据校验报告                             ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log(`\n📅 校验时间: ${new Date().toISOString()}`);
  }
  
  await validatePhysicalReality();
  await validateHumanCapability();
  await validateRouteDirection();
  await validateKnowledgeBase();
  await validateDecisionSupport();
  
  if (isJsonOutput) {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      results,
      summary: {
        total: results.length,
        pass: results.filter(r => r.status === 'PASS').length,
        warn: results.filter(r => r.status === 'WARN').length,
        fail: results.filter(r => r.status === 'FAIL').length,
      }
    }, null, 2));
  } else {
    // 打印结果表格
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('📊 校验结果汇总:\n');
    
    const groupedResults = results.reduce((acc, r) => {
      if (!acc[r.layer]) acc[r.layer] = [];
      acc[r.layer].push(r);
      return acc;
    }, {} as Record<string, ValidationResult[]>);
    
    for (const [layer, layerResults] of Object.entries(groupedResults)) {
      console.log(`【${layer}】`);
      for (const r of layerResults) {
        const statusIcon = r.status === 'PASS' ? '✅' : r.status === 'WARN' ? '⚠️' : '❌';
        console.log(`  ${statusIcon} ${r.metric}: ${r.message}`);
      }
      console.log();
    }
    
    // 汇总
    const pass = results.filter(r => r.status === 'PASS').length;
    const warn = results.filter(r => r.status === 'WARN').length;
    const fail = results.filter(r => r.status === 'FAIL').length;
    const total = results.length;
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`📈 校验汇总: ${total} 项检查`);
    console.log(`   ✅ 通过: ${pass} (${(pass/total*100).toFixed(0)}%)`);
    console.log(`   ⚠️ 警告: ${warn} (${(warn/total*100).toFixed(0)}%)`);
    console.log(`   ❌ 失败: ${fail} (${(fail/total*100).toFixed(0)}%)`);
    
    const overallStatus = fail > 0 ? '❌ 存在问题' : warn > 0 ? '⚠️ 基本正常' : '✅ 完全健康';
    console.log(`\n🏥 整体状态: ${overallStatus}`);
    console.log('═══════════════════════════════════════════════════════════════\n');
  }
}

main()
  .catch((e) => {
    console.error('❌ 校验失败:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

export {};
