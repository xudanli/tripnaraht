// scripts/index-iceland-kb-no-embedding.ts
// 简化版：只索引文件和chunks结构，使用零向量（后续可单独更新）

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

try {
  require('dotenv').config();
} catch (e) {}

// 简化的知识库加载器
function loadAllFiles(kbPath: string): Array<{
  filename: string;
  filepath: string;
  content: any;
  metadata: any;
}> {
  const files: Array<{
    filename: string;
    filepath: string;
    content: any;
    metadata: any;
  }> = [];

  const walkDir = (dirPath: string) => {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.name.endsWith('.json')) {
        try {
          const fileContent = fs.readFileSync(fullPath, 'utf-8');
          const content = JSON.parse(fileContent);

          files.push({
            filename: entry.name,
            filepath: fullPath,
            content,
            metadata: content.metadata || {
              version: '1.0.0',
              credibility_score: 0.8,
              language: 'zh-CN',
              data_sources: [],
              last_updated: new Date().toISOString(),
            },
          });

          console.log(`✅ 已加载: ${entry.name}`);
        } catch (error: any) {
          console.error(`❌ 加载失败 ${entry.name}:`, error.message);
        }
      }
    }
  };

  walkDir(kbPath);
  return files;
}

// 检测文件分类
function detectCategory(filename: string): string {
  if (filename.includes('rhythm') || filename.includes('persona')) {
    return 'decision_support';
  }
  if (filename.includes('rental') || filename.includes('packing')) {
    return 'practical_guides';
  }
  if (filename.includes('rules')) {
    return 'culture_rules';
  }
  if (filename.includes('risk') || filename.includes('hazard')) {
    return 'safety';
  }
  if (filename.includes('weather') || filename.includes('seasonal') || filename.includes('climate')) {
    return 'geography_seasonal';
  }
  if (filename.includes('route')) {
    return 'routes';
  }
  if (filename.includes('poi') || filename.includes('accommodation') || filename.includes('attraction')) {
    return 'pois';
  }
  return 'general';
}

// 简化的分块服务
function autoChunk(fileData: any): Array<{
  chunkId: string;
  content: string;
  type: string;
  credibilityScore: number;
  keywords: string[];
  section?: string;
  metadata?: any;
}> {
  const chunks: Array<{
    chunkId: string;
    content: string;
    type: string;
    credibilityScore: number;
    keywords: string[];
    section?: string;
    metadata?: any;
  }> = [];

  // 策略1: rhythm-patterns.json
  if (fileData.filename.includes('rhythm')) {
    const patterns = fileData.content.rhythm_patterns || fileData.content.patterns || [];
    patterns.forEach((item: any, index: number) => {
      const itemId = item.rhythm_id || item.id || `item_${index}`;
      chunks.push({
        chunkId: `${fileData.filename}_${itemId}_${index}`,
        content: JSON.stringify(item, null, 2),
        type: 'rhythm_pattern',
        credibilityScore: fileData.metadata.credibility_score,
        keywords: [item.rhythm_name || item.name || ''].filter(Boolean),
        metadata: { file: fileData.filename, index },
      });
    });
    return chunks;
  }

  // 策略2: car-rental-guide.json (按章节)
  if (fileData.filename.includes('rental')) {
    const sections = [
      'overview',
      'rental_companies',
      'vehicle_types',
      'insurance_breakdown',
      'pickup_process',
      'driving_rules',
      'return_process',
      'cost_planning',
    ];
    sections.forEach((section) => {
      if (fileData.content[section]) {
        chunks.push({
          chunkId: `${fileData.filename}_${section}`,
          content: JSON.stringify({ [section]: fileData.content[section] }, null, 2),
          type: 'operational_guide',
          credibilityScore: fileData.metadata.credibility_score,
          keywords: [section],
          section,
          metadata: { file: fileData.filename },
        });
      }
    });
    return chunks;
  }

  // 策略3: local-rules.json (按规则)
  if (fileData.filename.includes('rules')) {
    const rules = fileData.content.environmental_laws?.laws || 
                  fileData.content.laws || 
                  fileData.content.rules || 
                  [];
    rules.forEach((rule: any, index: number) => {
      chunks.push({
        chunkId: `${fileData.filename}_rule_${rule.law_id || index}`,
        content: JSON.stringify(rule, null, 2),
        type: 'legal_rule',
        credibilityScore: fileData.metadata.credibility_score,
        keywords: [rule.law, rule.name_en, ...(rule.prohibited || [])].filter(Boolean),
        metadata: { file: fileData.filename, severity: rule.penalty ? 'high' : 'medium' },
      });
    });
    return chunks;
  }

  // 默认：整个文件作为一个chunk
  return [{
    chunkId: `${fileData.filename}_full`,
    content: JSON.stringify(fileData.content, null, 2),
    type: 'general',
    credibilityScore: fileData.metadata.credibility_score,
    keywords: [fileData.filename],
  }];
}

async function indexKnowledgeBase() {
  const prisma = new PrismaClient();

  try {
    console.log('🚀 开始索引冰岛知识库（无向量模式）...\n');

    const kbPath = process.env.KB_PATH || './docs/iceland';
    console.log(`📁 知识库路径: ${kbPath}\n`);

    if (!fs.existsSync(kbPath)) {
      throw new Error(`知识库路径不存在: ${kbPath}`);
    }

    console.log('📚 加载知识库文件...\n');
    const files = loadAllFiles(kbPath);
    console.log(`\n📊 总共加载 ${files.length} 个文件\n`);

    if (files.length === 0) {
      console.log('⚠️  没有找到任何 JSON 文件');
      return;
    }

    // 生成零向量 (1536维)
    const zeroVector = new Array(1536).fill(0);

    for (const fileData of files) {
      console.log(`\n📝 处理文件: ${fileData.filename}`);

      try {
        const category = detectCategory(fileData.filename);
        const file = await prisma.knowledgeFile.upsert({
          where: { filename: fileData.filename },
          update: {
            filepath: fileData.filepath,
            category,
            version: fileData.metadata.version,
            credibilityScore: fileData.metadata.credibility_score,
            dataSources: fileData.metadata.data_sources || [],
            lastUpdated: new Date(fileData.metadata.last_updated),
          },
          create: {
            filename: fileData.filename,
            filepath: fileData.filepath,
            category,
            version: fileData.metadata.version,
            language: fileData.metadata.language || 'zh-CN',
            credibilityScore: fileData.metadata.credibility_score,
            dataSources: fileData.metadata.data_sources || [],
            lastUpdated: new Date(fileData.metadata.last_updated),
          },
        });

        const fileId = file.id;
        console.log(`  ✅ 文件记录已保存: ${fileId}`);

        const chunks = autoChunk(fileData);
        console.log(`  ✂️  生成 ${chunks.length} 个chunks`);

        if (chunks.length === 0) {
          console.log(`  ⚠️  跳过：没有生成任何chunks`);
          continue;
        }

        // 批量插入（使用零向量）
        console.log(`  💾 保存到数据库...`);
        const batchSize = 50;
        for (let i = 0; i < chunks.length; i += batchSize) {
          const batch = chunks.slice(i, i + batchSize);

          await prisma.$transaction(
            batch.map((chunk) => {
              return prisma.$executeRaw`
                INSERT INTO chunks (
                  id, chunk_id, content, embedding, type, credibility_score, 
                  keywords, file_id, section, metadata, created_at, updated_at
                )
                VALUES (
                  gen_random_uuid(),
                  ${chunk.chunkId},
                  ${chunk.content.substring(0, 50000)},
                  ${JSON.stringify(zeroVector)}::vector,
                  ${chunk.type},
                  ${chunk.credibilityScore},
                  ${chunk.keywords}::text[],
                  ${fileId}::uuid,
                  ${chunk.section || null},
                  ${chunk.metadata ? JSON.stringify(chunk.metadata) : null}::jsonb,
                  NOW(),
                  NOW()
                )
                ON CONFLICT (chunk_id) DO UPDATE SET
                  content = EXCLUDED.content,
                  updated_at = NOW()
              `;
            })
          );
        }

        console.log(`  ✅ 文件索引完成`);
      } catch (error: any) {
        console.error(`  ❌ 文件处理失败:`, error.message);
      }
    }

    console.log('\n✅ 知识库基础索引完成！\n');

    // 统计信息
    const fileCount = await prisma.knowledgeFile.count();
    const chunkCount = await prisma.chunk.count();

    console.log('📊 索引统计:');
    console.log(`  - 文件数: ${fileCount}`);
    console.log(`  - 分块数: ${chunkCount}`);
    console.log('\n⚠️  注意: 当前使用零向量，需要后续执行向量化更新');

  } catch (error: any) {
    console.error('\n❌ 索引失败:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

indexKnowledgeBase()
  .then(() => {
    console.log('\n✅ 索引脚本执行完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 索引脚本执行失败:', error);
    process.exit(1);
  });
