#!/usr/bin/env ts-node

/**
 * 导入打包清单模板数据到数据库
 * 
 * 使用方法:
 *   npx ts-node scripts/import-packing-templates.ts
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
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

async function importPackingChecklistTemplate() {
  try {
    logInfo('读取 packing-checklist-template.json...');
    const filePath = join(__dirname, '../data/packing-checklist-template.json');
    const content = readFileSync(filePath, 'utf-8');
    const templateData = JSON.parse(content);

    const version = templateData.metadata?.version || '1.0.0';
    const lastUpdated = templateData.metadata?.last_updated 
      ? new Date(templateData.metadata.last_updated)
      : new Date();

    // 检查是否已存在（使用原始 SQL）
    const existing = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id::text as id FROM packing_checklist_templates 
      WHERE version = ${version} AND is_active = true 
      LIMIT 1
    `;

    if (existing && existing.length > 0) {
      logWarning(`版本 ${version} 已存在，更新现有记录...`);
      const id = existing[0].id;
      await prisma.$executeRawUnsafe(`
        UPDATE packing_checklist_templates 
        SET template_data = $1::jsonb,
            last_updated = $2,
            updated_at = NOW()
        WHERE id = $3::uuid
      `, JSON.stringify(templateData), lastUpdated, id);
      logSuccess(`已更新打包清单模板 (版本: ${version})`);
    } else {
      await prisma.$executeRaw`
        INSERT INTO packing_checklist_templates (version, last_updated, template_data, is_active)
        VALUES (${version}, ${lastUpdated}, ${JSON.stringify(templateData)}::jsonb, true)
      `;
      logSuccess(`已创建打包清单模板 (版本: ${version})`);
    }

    console.log(`  文件大小: ${(content.length / 1024).toFixed(2)} KB`);
    console.log(`  最后更新: ${lastUpdated.toISOString()}`);
    
    return true;
  } catch (error: any) {
    logError(`导入打包清单模板失败: ${error.message}`);
    return false;
  }
}

async function importPackingGuide() {
  try {
    logInfo('读取 packing-guide.json...');
    const filePath = join(__dirname, '../data/packing-guide.json');
    const content = readFileSync(filePath, 'utf-8');
    const guideData = JSON.parse(content);

    const version = guideData.metadata?.version || '1.0.0';
    const lastUpdated = guideData.metadata?.last_updated
      ? new Date(guideData.metadata.last_updated)
      : new Date();

    // 检查是否已存在（使用原始 SQL）
    const existing = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id::text as id FROM packing_guides 
      WHERE version = ${version} AND is_active = true 
      LIMIT 1
    `;

    if (existing && existing.length > 0) {
      logWarning(`版本 ${version} 已存在，更新现有记录...`);
      await prisma.$executeRaw`
        UPDATE packing_guides 
        SET guide_data = ${JSON.stringify(guideData)}::jsonb,
            last_updated = ${lastUpdated},
            updated_at = NOW()
        WHERE id::text = ${existing[0].id}
      `;
      logSuccess(`已更新打包指南 (版本: ${version})`);
    } else {
      await prisma.$executeRaw`
        INSERT INTO packing_guides (version, last_updated, guide_data, is_active)
        VALUES (${version}, ${lastUpdated}, ${JSON.stringify(guideData)}::jsonb, true)
      `;
      logSuccess(`已创建打包指南 (版本: ${version})`);
    }

    console.log(`  文件大小: ${(content.length / 1024).toFixed(2)} KB`);
    console.log(`  最后更新: ${lastUpdated.toISOString()}`);
    
    return true;
  } catch (error: any) {
    logError(`导入打包指南失败: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log(`${colors.cyan}
╔══════════════════════════════════════════════════════════════╗
║       打包清单模板数据导入工具                                ║
╚══════════════════════════════════════════════════════════════╝${colors.reset}\n`);

  let successCount = 0;
  let failCount = 0;

  // 导入打包清单模板
  console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.cyan}1. 导入打包清单模板${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);

  const templateResult = await importPackingChecklistTemplate();
  if (templateResult) {
    successCount++;
  } else {
    failCount++;
  }

  // 导入打包指南
  console.log(`\n${colors.cyan}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.cyan}2. 导入打包指南${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);

  const guideResult = await importPackingGuide();
  if (guideResult) {
    successCount++;
  } else {
    failCount++;
  }

  // 总结
  console.log(`\n${colors.cyan}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.cyan}导入总结${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);

  console.log(`成功导入: ${colors.green}${successCount}${colors.reset} 个`);
  console.log(`导入失败: ${colors.red}${failCount}${colors.reset} 个`);
  console.log(`总计: 2 个\n`);

  // 验证（使用原始 SQL）
  const templateCountResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::int as count FROM packing_checklist_templates WHERE is_active = true
  `;
  const templateCount = templateCountResult[0]?.count || 0;

  const guideCountResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::int as count FROM packing_guides WHERE is_active = true
  `;
  const guideCount = guideCountResult[0]?.count || 0;

  console.log(`${colors.cyan}数据库中的记录:${colors.reset}`);
  console.log(`  打包清单模板: ${templateCount} 条`);
  console.log(`  打包指南: ${guideCount} 条\n`);

  if (successCount === 2) {
    logSuccess('所有数据导入完成！');
  } else if (failCount > 0) {
    logError('部分数据导入失败，请检查错误信息');
    process.exit(1);
  }
}

// 运行导入
if (require.main === module) {
  main()
    .catch((error) => {
      console.error('未捕获的错误:', error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export { main };
