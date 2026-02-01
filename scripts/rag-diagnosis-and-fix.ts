#!/usr/bin/env tsx
/**
 * RAG知识库诊断和修复脚本
 * 
 * 问题：
 * 1. DocumentIndex表（旧系统）有42条记录
 * 2. KnowledgeFile表（新系统）应该有71个文件，但可能在不同环境
 * 3. 需要建立两个系统之间的关联
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function diagnoseDatabase() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 RAG知识库诊断');
  console.log('='.repeat(60));

  // 1. 检查DocumentIndex表（已删除，跳过）
  // document_index表已删除，使用KnowledgeFile + Chunks表
  const docIndexCount = 0;
  const docIndexFiles: any[] = [];
  // const docIndexCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
  //   SELECT COUNT(*) as count FROM document_index
  // `;
  // const docIndexFiles = await prisma.$queryRaw<Array<{
  //   id: string;
  //   title: string;
  //   source: string | null;
  //   collection: string;
  //   created_at: Date;
  //   updated_at: Date;
  // }>>`
  //   SELECT id, title, source, collection, created_at, updated_at
  //   FROM document_index
  //   ORDER BY updated_at DESC
  //   LIMIT 20
  // `;

  // 2. 检查KnowledgeFile表
  const knowledgeFilesCount = await prisma.knowledgeFile.count();
  const knowledgeFiles = await prisma.knowledgeFile.findMany({
    take: 20,
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { chunks: true } } }
  });

  // 3. 检查Chunks表
  const chunksCount = await prisma.chunk.count();
  const chunksWithEmbedding = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*) as count FROM chunks WHERE embedding IS NOT NULL`
  );

  // 4. 统计信息
  console.log('\n📋 表状态统计:');
  console.log(`  DocumentIndex表 (旧系统): ${docIndexCount} 条记录`);
  console.log(`  KnowledgeFile表 (新系统): ${knowledgeFilesCount} 条记录`);
  console.log(`  Chunks表: ${chunksCount} 条记录`);
  console.log(`  已向量化chunks: ${chunksWithEmbedding[0]?.count || 0}`);

  // 5. 检查DocumentIndex表的fileId字段
  const docsWithoutFileId = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*) as count FROM document_index WHERE source IS NULL OR source = ''`
  );

  console.log(`\n⚠️  问题诊断:`);
  console.log(`  缺少source的DocumentIndex记录: ${docsWithoutFileId[0]?.count || 0}`);

  // 6. 检查文件关联
  if (docIndexFiles.length > 0) {
    console.log(`\n📄 DocumentIndex表样本 (前20个):`);
    docIndexFiles.forEach((d, i) => {
      const hasSource = d.source ? '✅' : '⚠️';
      console.log(`  ${hasSource} ${i+1}. ${d.title} [${d.collection}]`);
      console.log(`     来源: ${d.source || '无'}`);
    });
  }

  if (knowledgeFiles.length > 0) {
    console.log(`\n📁 KnowledgeFile表样本 (前20个):`);
    knowledgeFiles.forEach((f, i) => {
      const status = f._count.chunks > 0 ? '✅' : '⚠️';
      console.log(`  ${status} ${i+1}. ${f.filename} [${f.category}] - ${f._count.chunks} chunks`);
    });
  }

  // 7. 检查是否有文件缺少chunks
  if (knowledgeFilesCount > 0) {
    const filesWithoutChunks = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `
      SELECT COUNT(*) as count 
      FROM knowledge_files kf
      LEFT JOIN chunks c ON c.file_id = kf.id
      WHERE c.id IS NULL
      `
    );
    console.log(`\n⚠️  无chunks的文件数: ${filesWithoutChunks[0]?.count || 0}`);
  }

  return {
    docIndexCount,
    knowledgeFilesCount,
    chunksCount,
    chunksWithEmbedding: chunksWithEmbedding[0]?.count || 0,
    docsWithoutFileId: docsWithoutFileId[0]?.count || 0,
  };
}

async function checkFileSystem() {
  console.log('\n' + '='.repeat(60));
  console.log('📂 文件系统检查');
  console.log('='.repeat(60));

  const docsPath = './docs';
  if (!fs.existsSync(docsPath)) {
    console.log(`\n❌ docs目录不存在: ${docsPath}`);
    return { totalFiles: 0, files: [] };
  }

  const files: Array<{ path: string; filename: string }> = [];
  
  function walkDir(dirPath: string) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.name.endsWith('.json')) {
        files.push({
          path: fullPath,
          filename: entry.name,
        });
      }
    }
  }

  walkDir(docsPath);

  console.log(`\n找到 ${files.length} 个JSON文件`);
  console.log(`\n文件列表 (前20个):`);
  files.slice(0, 20).forEach((f, i) => {
    console.log(`  ${i+1}. ${f.filename} (${f.path})`);
  });

  return { totalFiles: files.length, files };
}

async function generateReport() {
  console.log('\n' + '='.repeat(60));
  console.log('📝 生成诊断报告');
  console.log('='.repeat(60));

  const dbStats = await diagnoseDatabase();
  const fsStats = await checkFileSystem();

  const report = {
    timestamp: new Date().toISOString(),
    database: {
      documentIndex: {
        total: Number(dbStats.docIndexCount),
        withoutSource: Number(dbStats.docsWithoutFileId),
      },
      knowledgeFiles: {
        total: Number(dbStats.knowledgeFilesCount),
      },
      chunks: {
        total: Number(dbStats.chunksCount),
        withEmbedding: Number(dbStats.chunksWithEmbedding),
      },
    },
    fileSystem: {
      totalFiles: fsStats.totalFiles,
    },
    issues: [] as string[],
    recommendations: [] as string[],
  };

  // 识别问题
  if (dbStats.knowledgeFilesCount === 0 && fsStats.totalFiles > 0) {
    report.issues.push('KnowledgeFile表为空，但文件系统中有文件');
    report.recommendations.push('需要运行导入脚本将文件导入到KnowledgeFile表');
  }

  if (dbStats.chunksCount === 0 && dbStats.knowledgeFilesCount > 0) {
    report.issues.push('KnowledgeFile表有文件，但Chunks表为空');
    report.recommendations.push('需要运行索引脚本生成chunks和向量');
  }

  if (dbStats.docsWithoutFileId > 0) {
    report.issues.push(`${dbStats.docsWithoutFileId}个DocumentIndex记录缺少source字段`);
    report.recommendations.push('需要建立DocumentIndex和KnowledgeFile之间的关联');
  }

  if (dbStats.knowledgeFilesCount > 0 && dbStats.chunksCount === 0) {
    report.issues.push('文件已导入但未生成chunks');
    report.recommendations.push('运行索引脚本: npx tsx scripts/index-all-docs-kb.ts');
  }

  console.log('\n📊 诊断报告:');
  console.log(JSON.stringify(report, null, 2));

  // 保存报告
  const reportPath = './rag-diagnosis-report.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n✅ 报告已保存到: ${reportPath}`);

  return report;
}

async function main() {
  try {
    await generateReport();

    console.log('\n' + '='.repeat(60));
    console.log('✅ 诊断完成');
    console.log('='.repeat(60));
    console.log('\n💡 下一步操作建议:');
    console.log('1. 如果KnowledgeFile表为空，运行: npx tsx scripts/index-all-docs-kb.ts');
    console.log('2. 如果Chunks表为空，运行: npx tsx scripts/index-all-docs-kb.ts');
    console.log('3. 查看详细报告: cat rag-diagnosis-report.json');
    console.log('');

  } catch (error: any) {
    console.error('\n❌ 诊断失败:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main();
