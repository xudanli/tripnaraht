#!/usr/bin/env ts-node

/**
 * 检查 Readiness Pack 数据
 * 
 * 功能：
 * 1. 检查数据库中的 Pack 数据
 * 2. 检查 JSON 文件中的 Pack 数据
 * 3. 验证数据结构和完整性
 * 4. 显示统计信息
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function logSuccess(message: string) {
  console.log(`${colors.green}✅ ${message}${colors.reset}`);
}

function logError(message: string) {
  console.log(`${colors.red}❌ ${message}${colors.reset}`);
}

function logInfo(message: string) {
  console.log(`${colors.blue}ℹ️  ${message}${colors.reset}`);
}

function logWarning(message: string) {
  console.log(`${colors.yellow}⚠️  ${message}${colors.reset}`);
}

function logSection(title: string) {
  console.log(`\n${colors.cyan}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.cyan}${title}${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);
}

// 检查数据库中的 Pack
async function checkDatabasePacks() {
  logSection('检查数据库中的 Pack 数据');

  try {
    // 获取所有 Pack
    const allPacks = await prisma.readinessPack.findMany({
      orderBy: { updatedAt: 'desc' },
    });

    logInfo(`数据库中共有 ${allPacks.length} 个 Pack`);

    // 统计信息
    const activePacks = allPacks.filter(p => p.isActive);
    const inactivePacks = allPacks.filter(p => !p.isActive);

    console.log(`\n📊 统计信息:`);
    console.log(`  激活的 Pack: ${activePacks.length}`);
    console.log(`  停用的 Pack: ${inactivePacks.length}`);

    // 按国家代码分组
    const byCountry: Record<string, number> = {};
    allPacks.forEach(pack => {
      byCountry[pack.countryCode] = (byCountry[pack.countryCode] || 0) + 1;
    });

    console.log(`\n🌍 按国家代码分布:`);
    Object.entries(byCountry)
      .sort((a, b) => b[1] - a[1])
      .forEach(([country, count]) => {
        console.log(`  ${country}: ${count} 个`);
      });

    // 检查 Pack 数据结构
    console.log(`\n📋 Pack 列表:`);
    allPacks.forEach((pack, index) => {
      const status = pack.isActive ? '✓' : '✗';
      const packData = pack.packData as any;
      const rulesCount = packData?.rules?.length || 0;
      const checklistsCount = packData?.checklists?.length || 0;
      const hazardsCount = packData?.hazards?.length || 0;

      console.log(`\n  ${index + 1}. [${status}] ${pack.packId}`);
      console.log(`     目的地: ${pack.destinationId}`);
      console.log(`     国家: ${pack.countryCode}`);
      console.log(`     版本: ${pack.version}`);
      console.log(`     规则数: ${rulesCount}`);
      console.log(`     清单数: ${checklistsCount}`);
      console.log(`     风险数: ${hazardsCount}`);
      console.log(`     更新于: ${pack.updatedAt.toISOString()}`);

      // 验证必要字段
      const issues: string[] = [];
      if (!packData?.packId) issues.push('缺少 packId');
      if (!packData?.destinationId) issues.push('缺少 destinationId');
      if (!packData?.rules || packData.rules.length === 0) issues.push('缺少规则');
      if (!packData?.displayName) issues.push('缺少 displayName');

      if (issues.length > 0) {
        logWarning(`     问题: ${issues.join(', ')}`);
      }
    });

    return { allPacks, activePacks, inactivePacks };
  } catch (error: any) {
    logError(`检查数据库 Pack 失败: ${error.message}`);
    console.error(error);
    return null;
  }
}

// 检查 JSON 文件中的 Pack
function checkJsonPacks() {
  logSection('检查 JSON 文件中的 Pack 数据');

  const packsDirectory = join(__dirname, '../src/trips/readiness/data/packs');

  if (!existsSync(packsDirectory)) {
    logError(`Pack 目录不存在: ${packsDirectory}`);
    return null;
  }

  try {
    const files = readdirSync(packsDirectory).filter(f => f.endsWith('.json'));
    logInfo(`找到 ${files.length} 个 JSON 文件`);

    const packs: Array<{
      filename: string;
      packId: string;
      destinationId: string;
      rulesCount: number;
      checklistsCount: number;
      hazardsCount: number;
      issues: string[];
    }> = [];

    files.forEach(filename => {
      try {
        const filePath = join(packsDirectory, filename);
        const content = readFileSync(filePath, 'utf-8');
        const pack = JSON.parse(content);

        const issues: string[] = [];
        if (!pack.packId) issues.push('缺少 packId');
        if (!pack.destinationId) issues.push('缺少 destinationId');
        if (!pack.rules || pack.rules.length === 0) issues.push('缺少规则');
        if (!pack.displayName) issues.push('缺少 displayName');
        if (!pack.version) issues.push('缺少 version');
        if (!pack.lastReviewedAt) issues.push('缺少 lastReviewedAt');

        packs.push({
          filename,
          packId: pack.packId || 'N/A',
          destinationId: pack.destinationId || 'N/A',
          rulesCount: pack.rules?.length || 0,
          checklistsCount: pack.checklists?.length || 0,
          hazardsCount: pack.hazards?.length || 0,
          issues,
        });
      } catch (error: any) {
        logError(`解析文件 ${filename} 失败: ${error.message}`);
      }
    });

    console.log(`\n📋 JSON 文件列表:`);
    packs.forEach((pack, index) => {
      const status = pack.issues.length === 0 ? '✓' : '✗';
      console.log(`\n  ${index + 1}. [${status}] ${pack.filename}`);
      console.log(`     Pack ID: ${pack.packId}`);
      console.log(`     目的地: ${pack.destinationId}`);
      console.log(`     规则数: ${pack.rulesCount}`);
      console.log(`     清单数: ${pack.checklistsCount}`);
      console.log(`     风险数: ${pack.hazardsCount}`);

      if (pack.issues.length > 0) {
        logWarning(`     问题: ${pack.issues.join(', ')}`);
      }
    });

    // 统计
    const validPacks = packs.filter(p => p.issues.length === 0);
    const invalidPacks = packs.filter(p => p.issues.length > 0);

    console.log(`\n📊 统计信息:`);
    console.log(`  有效 Pack: ${validPacks.length}`);
    console.log(`  无效 Pack: ${invalidPacks.length}`);
    console.log(`  总规则数: ${packs.reduce((sum, p) => sum + p.rulesCount, 0)}`);
    console.log(`  总清单数: ${packs.reduce((sum, p) => sum + p.checklistsCount, 0)}`);
    console.log(`  总风险数: ${packs.reduce((sum, p) => sum + p.hazardsCount, 0)}`);

    return packs;
  } catch (error: any) {
    logError(`检查 JSON Pack 失败: ${error.message}`);
    console.error(error);
    return null;
  }
}

// 对比数据库和 JSON 文件
async function compareDatabaseAndJson(dbPacks: any, jsonPacks: any) {
  logSection('对比数据库和 JSON 文件');

  if (!dbPacks || !jsonPacks) {
    logWarning('无法对比：缺少数据');
    return;
  }

  const dbPackIds = new Set(dbPacks.allPacks.map((p: any) => p.packId));
  const jsonPackIds = new Set(jsonPacks.map((p: any) => p.packId));

  // 在数据库但不在 JSON 文件
  const onlyInDb = Array.from(dbPackIds).filter(id => !jsonPackIds.has(id));
  if (onlyInDb.length > 0) {
    logWarning(`仅在数据库中的 Pack (${onlyInDb.length} 个):`);
    onlyInDb.forEach(id => console.log(`  - ${id}`));
  }

  // 在 JSON 文件但不在数据库
  const onlyInJson = Array.from(jsonPackIds).filter(id => !dbPackIds.has(id));
  if (onlyInJson.length > 0) {
    logWarning(`仅在 JSON 文件中的 Pack (${onlyInJson.length} 个):`);
    onlyInJson.forEach(id => console.log(`  - ${id}`));
  }

  // 两者都有
  const inBoth = Array.from(dbPackIds).filter(id => jsonPackIds.has(id));
  if (inBoth.length > 0) {
    logSuccess(`数据库和 JSON 文件都有的 Pack (${inBoth.length} 个):`);
    inBoth.forEach(id => console.log(`  ✓ ${id}`));
  }
}

// 检查规则结构
async function checkRulesStructure() {
  logSection('检查规则结构');

  try {
    const packs = await prisma.readinessPack.findMany({
      where: { isActive: true },
      take: 5, // 只检查前 5 个
    });

    const ruleStats = {
      totalRules: 0,
      byCategory: {} as Record<string, number>,
      bySeverity: {} as Record<string, number>,
      withConditions: 0,
      withEvidence: 0,
    };

    packs.forEach(pack => {
      const packData = pack.packData as any;
      const rules = packData?.rules || [];

      rules.forEach((rule: any) => {
        ruleStats.totalRules++;
        
        // 按类别统计
        const category = rule.category || 'unknown';
        ruleStats.byCategory[category] = (ruleStats.byCategory[category] || 0) + 1;

        // 按严重程度统计
        const severity = rule.severity || 'unknown';
        ruleStats.bySeverity[severity] = (ruleStats.bySeverity[severity] || 0) + 1;

        // 有条件的规则
        if (rule.when) {
          ruleStats.withConditions++;
        }

        // 有证据的规则
        if (rule.evidence) {
          ruleStats.withEvidence++;
        }
      });
    });

    console.log(`\n📊 规则统计 (前 ${packs.length} 个 Pack):`);
    console.log(`  总规则数: ${ruleStats.totalRules}`);
    console.log(`  有条件的规则: ${ruleStats.withConditions}`);
    console.log(`  有证据的规则: ${ruleStats.withEvidence}`);

    console.log(`\n📂 按类别分布:`);
    Object.entries(ruleStats.byCategory)
      .sort((a, b) => b[1] - a[1])
      .forEach(([category, count]) => {
        console.log(`  ${category}: ${count}`);
      });

    console.log(`\n⚡ 按严重程度分布:`);
    Object.entries(ruleStats.bySeverity)
      .sort((a, b) => b[1] - a[1])
      .forEach(([severity, count]) => {
        console.log(`  ${severity}: ${count}`);
      });

  } catch (error: any) {
    logError(`检查规则结构失败: ${error.message}`);
    console.error(error);
  }
}

// 主函数
async function main() {
  console.log(`${colors.cyan}
╔══════════════════════════════════════════════════════════════╗
║          Readiness Pack 数据检查工具                          ║
╚══════════════════════════════════════════════════════════════╝${colors.reset}\n`);

  try {
    // 1. 检查数据库
    const dbPacks = await checkDatabasePacks();

    // 2. 检查 JSON 文件
    const jsonPacks = checkJsonPacks();

    // 3. 对比
    await compareDatabaseAndJson(dbPacks, jsonPacks);

    // 4. 检查规则结构
    await checkRulesStructure();

    // 总结
    logSection('检查完成');
    logSuccess('数据检查完成！');

  } catch (error: any) {
    logError(`检查失败: ${error.message}`);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行
if (require.main === module) {
  main().catch((error) => {
    console.error('未捕获的错误:', error);
    process.exit(1);
  });
}

export { main };
