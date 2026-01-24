#!/usr/bin/env tsx
/**
 * 检查冰岛知识库导入状态
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('='.repeat(60));
  console.log('冰岛知识库导入状态检查');
  console.log('='.repeat(60));
  console.log('');

  try {
    // 1. 检查知识库表是否存在
    console.log('📊 检查数据库表...');
    try {
      // 尝试查询 KnowledgeBase 表
      const kbCount = await prisma.$queryRaw`
        SELECT COUNT(*) as count
        FROM "KnowledgeBase"
        WHERE country_code = 'IS'
      `;
      console.log('  ✅ KnowledgeBase 表存在');
      console.log(`  冰岛知识库文档数: ${(kbCount as any)[0]?.count || 0}`);
    } catch (error: any) {
      if (error.code === 'P2021' || error.message.includes('does not exist')) {
        console.log('  ⚠️  KnowledgeBase 表不存在，需要运行迁移');
      } else {
        throw error;
      }
    }

    try {
      // 尝试查询 KnowledgeChunk 表
      const chunkCount = await prisma.$queryRaw`
        SELECT COUNT(*) as count
        FROM "KnowledgeChunk" kc
        JOIN "KnowledgeBase" kb ON kc.knowledge_base_id = kb.id
        WHERE kb.country_code = 'IS'
      `;
      console.log('  ✅ KnowledgeChunk 表存在');
      console.log(`  冰岛知识块数: ${(chunkCount as any)[0]?.count || 0}`);
    } catch (error: any) {
      if (error.code === 'P2021' || error.message.includes('does not exist')) {
        console.log('  ⚠️  KnowledgeChunk 表不存在，需要运行迁移');
      } else {
        throw error;
      }
    }
    console.log('');

    // 2. 检查源文件
    console.log('📁 检查源文件...');
    const docsPath = path.join(process.cwd(), 'docs/iceland');

    if (!fs.existsSync(docsPath)) {
      console.log(`  ❌ 文档目录不存在: ${docsPath}`);
      return;
    }

    const categories = {
      pois: ['attractions.json', 'accommodations.json', 'services.json', 'supplies.json'],
      routes: ['golden-circle.json', 'ring-road-south.json', 'snaefellsnes.json', 'highlands.json', 'ring-road-full.json', 'westfjords.json'],
      geography: ['climate.json', 'terrain.json', 'seasonal-features.json'],
      risks: ['weather-risks.json', 'safety-alerts.json', 'accessibility.json', 'terrain-risks.json'],
      practical: ['car-rental-guide.json', 'local-rules.json', 'packing-guide.json'],
      'decision-support': ['user-personas.json', 'feasibility-matrix.json', 'rhythm-patterns.json'],
    };

    let totalFiles = 0;
    let existingFiles = 0;

    for (const [category, files] of Object.entries(categories)) {
      const categoryPath = path.join(docsPath, category);
      console.log(`\n  📂 ${category}/`);

      for (const file of files) {
        const filePath = path.join(categoryPath, file);
        totalFiles++;
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          console.log(`    ✅ ${file} (${(stats.size / 1024).toFixed(2)} KB)`);
          existingFiles++;
        } else {
          console.log(`    ❌ ${file} (缺失)`);
        }
      }
    }

    console.log('');
    console.log(`  总计: ${existingFiles}/${totalFiles} 个文件存在`);
    console.log('');

    // 3. 检查旧的 DocumentIndex 表（如果存在）
    console.log('📚 检查旧的 DocumentIndex 表...');
    try {
      const oldDocs = await prisma.$queryRaw`
        SELECT COUNT(*) as count
        FROM "DocumentIndex"
        WHERE metadata->>'countryCode' = 'IS'
      `;
      console.log(`  冰岛文档数: ${(oldDocs as any)[0]?.count || 0}`);
    } catch (error: any) {
      if (error.code === 'P2021' || error.message.includes('does not exist')) {
        console.log('  ⚠️  DocumentIndex 表不存在（这是正常的，新系统使用 KnowledgeBase）');
      } else {
        console.log(`  ⚠️  查询失败: ${error.message}`);
      }
    }
    console.log('');

    // 4. 建议
    console.log('='.repeat(60));
    console.log('💡 建议操作:');
    console.log('='.repeat(60));
    console.log('');
    console.log('1️⃣  如果知识库表不存在，运行迁移:');
    console.log('   npx tsx scripts/setup-knowledge-base-tables.ts');
    console.log('');
    console.log('2️⃣  索引冰岛知识库:');
    console.log('   npx tsx scripts/index-iceland-knowledge-base.ts');
    console.log('');
    console.log('3️⃣  测试检索功能:');
    console.log('   curl -X POST http://localhost:3000/rag/chunks/retrieve \\');
    console.log('     -H "Content-Type: application/json" \\');
    console.log('     -d \'{"query": "冰岛租车", "countryCode": "IS", "limit": 5}\'');
    console.log('');

  } catch (error) {
    console.error('❌ 错误:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
