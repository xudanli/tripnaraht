#!/usr/bin/env tsx
/**
 * 检查向量质量
 * 检测异常向量（如全0.1的向量）
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function checkVectorQuality() {
  console.log('🔍 检查向量质量...\n');

  // 1. 检查异常向量
  console.log('1️⃣ 检查异常向量');
  console.log('='.repeat(80));
  
  try {
    // 检查是否有全0.1的向量
    const suspiciousVectors = await prisma.$queryRawUnsafe<Array<{
      chunk_id: string;
      filename: string;
      unique_values: number;
      min_val: number;
      max_val: number;
      avg_val: number;
    }>>(
      `
      SELECT 
        c.chunk_id,
        kf.filename,
        (
          SELECT COUNT(DISTINCT val::numeric)
          FROM unnest(c.embedding::text::float[]) as val
        ) as unique_values,
        (
          SELECT MIN(val::numeric)
          FROM unnest(c.embedding::text::float[]) as val
        ) as min_val,
        (
          SELECT MAX(val::numeric)
          FROM unnest(c.embedding::text::float[]) as val
        ) as max_val,
        (
          SELECT AVG(val::numeric)
          FROM unnest(c.embedding::text::float[]) as val
        ) as avg_val
      FROM chunks c
      INNER JOIN knowledge_files kf ON c.file_id = kf.id
      WHERE c.embedding IS NOT NULL
      ORDER BY unique_values ASC
      LIMIT 10
      `
    );

    console.log(`找到 ${suspiciousVectors.length} 个可疑向量\n`);
    suspiciousVectors.forEach((v, i) => {
      const isSuspicious = v.unique_values < 10 || Math.abs(v.min_val - v.max_val) < 0.01;
      const status = isSuspicious ? '⚠️  异常' : '✅ 正常';
      console.log(`${i + 1}. ${status} ${v.filename}`);
      console.log(`   唯一值数量: ${v.unique_values}`);
      console.log(`   值范围: [${v.min_val.toFixed(6)}, ${v.max_val.toFixed(6)}]`);
      console.log(`   平均值: ${v.avg_val.toFixed(6)}`);
      console.log('');
    });

    // 2. 统计异常向量数量
    const stats = await prisma.$queryRawUnsafe<Array<{
      total: bigint;
      suspicious: bigint;
      normal: bigint;
    }>>(
      `
      WITH vector_stats AS (
        SELECT 
          c.id,
          (
            SELECT COUNT(DISTINCT val::numeric)
            FROM unnest(c.embedding::text::float[]) as val
          ) as unique_values,
          (
            SELECT MAX(val::numeric) - MIN(val::numeric)
            FROM unnest(c.embedding::text::float[]) as val
          ) as value_range
        FROM chunks c
        WHERE c.embedding IS NOT NULL
      )
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE unique_values < 10 OR value_range < 0.01) as suspicious,
        COUNT(*) FILTER (WHERE unique_values >= 10 AND value_range >= 0.01) as normal
      FROM vector_stats
      `
    );

    if (stats[0]) {
      const s = stats[0];
      console.log('📊 向量质量统计:');
      console.log(`   总向量数: ${s.total}`);
      console.log(`   异常向量: ${s.suspicious} (${((Number(s.suspicious) / Number(s.total)) * 100).toFixed(1)}%)`);
      console.log(`   正常向量: ${s.normal} (${((Number(s.normal) / Number(s.total)) * 100).toFixed(1)}%)`);
    }

  } catch (error: any) {
    console.error(`❌ 检查失败: ${error.message}`);
  }

  await prisma.$disconnect();
}

checkVectorQuality().catch(console.error);
