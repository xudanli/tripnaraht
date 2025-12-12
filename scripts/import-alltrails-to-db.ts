// scripts/import-alltrails-to-db.ts

/**
 * 将 AllTrails 爬取的数据导入到数据库
 * 
 * 使用方法:
 *   npm run import:alltrails -- <json_file>
 * 
 * 示例:
 *   npm run import:alltrails -- alltrails_1765537604163.json
 */

import { PrismaClient, PlaceCategory } from '@prisma/client';
import * as fs from 'fs/promises';
import { randomUUID } from 'crypto';
import { TrailDifficultyAssessor } from '../src/places/utils/trail-difficulty-assessor.util';

const prisma = new PrismaClient();

interface AllTrailsData {
  difficultyMetadata?: {
    level: string;
    source?: string;
    confidence?: number;
    riskFactors?: string[];
    requiresEquipment?: boolean;
    requiresGuide?: boolean;
  };
  fatigueMetadata?: {
    totalDistance?: number;
    elevationGain?: number;
    maxElevation?: number;
  };
  metadata: {
    source: string;
    sourceUrl: string;
    name?: string;
    location?: string;
    rating?: string;
    description?: string;
    length?: string;
    elevationGain?: string;
    estimatedTime?: string;
    visitDuration?: string;
  };
}

/**
 * 导入单个 AllTrails 数据到数据库
 */
async function importTrail(data: AllTrailsData): Promise<boolean> {
  try {
    // 检查是否已存在（通过 sourceUrl）
    const existing = await prisma.place.findFirst({
      where: {
        metadata: {
          path: ['sourceUrl'],
          equals: data.metadata.sourceUrl,
        },
      } as any,
    });

    if (existing) {
      console.log(`⏭️  已存在: ${data.metadata.name || data.metadata.sourceUrl}`);
      return false;
    }

    // 准备 metadata
    const metadata: any = {
      ...data.metadata,
      crawledAt: new Date().toISOString(),
    };

    // 如果有 difficultyMetadata，添加到 metadata 中
    if (data.difficultyMetadata) {
      metadata.difficultyMetadata = data.difficultyMetadata;
    }

    // 准备 physicalMetadata（Fatigue）
    let physicalMetadata: any = null;
    if (data.fatigueMetadata) {
      physicalMetadata = {
        totalDistance: data.fatigueMetadata.totalDistance,
        elevationGain: data.fatigueMetadata.elevationGain,
        maxElevation: data.fatigueMetadata.maxElevation,
        source: 'alltrails',
      };
    }

    // 如果有 visitDuration，添加到 physicalMetadata
    if (data.metadata.visitDuration) {
      if (!physicalMetadata) {
        physicalMetadata = {};
      }
      physicalMetadata.visitDuration = data.metadata.visitDuration;
    }

    // 创建 Place
    const place = await prisma.place.create({
      data: {
        uuid: randomUUID(),
        nameCN: data.metadata.name || 'Unknown Trail',
        nameEN: data.metadata.name || null,
        category: PlaceCategory.ATTRACTION,
        address: data.metadata.location || null,
        rating: data.metadata.rating ? parseFloat(data.metadata.rating) : null,
        metadata: metadata as any,
        physicalMetadata: physicalMetadata as any,
        updatedAt: new Date(),
      } as any,
    });

    console.log(`✅ 已导入: ${data.metadata.name || data.metadata.sourceUrl} (ID: ${place.id})`);
    return true;
  } catch (error: any) {
    console.error(`❌ 导入失败: ${data.metadata.name || data.metadata.sourceUrl} - ${error.message}`);
    return false;
  }
}

/**
 * 批量导入
 */
async function importFromFile(filePath: string): Promise<void> {
  try {
    console.log(`📂 正在读取文件: ${filePath}`);
    const content = await fs.readFile(filePath, 'utf-8');
    
    // 判断是单个对象还是数组
    let dataArray: AllTrailsData[];
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        dataArray = parsed;
      } else {
        dataArray = [parsed];
      }
    } catch (e) {
      console.error('❌ JSON 解析失败');
      throw e;
    }

    console.log(`📊 找到 ${dataArray.length} 条数据\n`);

    let successCount = 0;
    let skipCount = 0;
    let failCount = 0;

    for (let i = 0; i < dataArray.length; i++) {
      const data = dataArray[i];
      console.log(`[${i + 1}/${dataArray.length}] 正在处理: ${data.metadata.name || data.metadata.sourceUrl}`);
      
      try {
        const result = await importTrail(data);
        if (result) {
          successCount++;
        } else {
          skipCount++;
        }
      } catch (error: any) {
        failCount++;
        console.error(`  ❌ 处理失败: ${error.message}`);
      }

      // 添加小延时，避免数据库压力
      if (i < dataArray.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`\n📊 导入完成:`);
    console.log(`   ✅ 成功: ${successCount}`);
    console.log(`   ⏭️  跳过: ${skipCount}`);
    console.log(`   ❌ 失败: ${failCount}`);
  } catch (error: any) {
    console.error(`❌ 导入失败: ${error.message}`);
    throw error;
  }
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
使用方法:
  npm run import:alltrails -- <json_file>

示例:
  npm run import:alltrails -- alltrails_1765537604163.json
  npm run import:alltrails -- alltrails_list_1765537604163.json

说明:
  - 支持单个对象或数组格式的 JSON 文件
  - 自动检查重复（通过 sourceUrl）
  - 自动提取 difficultyMetadata 和 fatigueMetadata
    `);
    process.exit(0);
  }

  const filePath = args[0];
  
  try {
    await importFromFile(filePath);
  } catch (error: any) {
    console.error(`❌ 错误: ${error.message}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行
if (require.main === module) {
  main().catch(console.error);
}

