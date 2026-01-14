/**
 * 冰岛 POI 名称翻译脚本
 * 
 * 用途：
 * - 为 nameEN 字段为空的冰岛 POI 生成英文名称
 * - 根据 nameCN 字段翻译成英文
 * 
 * 使用方法：
 *   tsx scripts/translate-iceland-poi-names.ts [--dry-run] [--batch-size=50] [--limit=1000]
 * 
 * 或使用 npm script：
 *   npm run script:translate-iceland-poi-names
 */

import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { LlmService } from '../src/llm/services/llm.service';
import { LlmProvider } from '../src/llm/dto/llm-request.dto';

const prisma = new PrismaClient();

// 配置
const DEFAULT_BATCH_SIZE = 50; // 翻译批次较小，避免 API 限流
const DEFAULT_LIMIT = 1000;

// 翻译结果接口
interface TranslationResult {
  placeId: number;
  nameCN: string;
  nameEN: string | null;
  success: boolean;
  error?: string;
}

/**
 * 使用 LLM 翻译中文名称到英文
 */
async function translateName(
  nameCN: string,
  llmService: LlmService
): Promise<string> {
  if (!nameCN || nameCN.trim().length === 0) {
    throw new Error('nameCN 不能为空');
  }

  // 构建翻译提示词
  const prompt = `请将以下中文地名翻译成英文。只返回英文翻译，不要包含任何解释或其他内容。

中文名称：${nameCN}

英文翻译：`;

  try {
    // 调用 LLM 服务（使用默认 provider，让服务自动选择）
    // 注意：LlmService 会根据配置的 API Key 自动选择 provider
    const response = await llmService.callLlmWithSchema(
      LlmProvider.DEEPSEEK, // 优先使用 DeepSeek，如果没有配置会自动回退
      prompt
    );
    
    // 清理响应（移除可能的引号、换行等）
    const translated = response
      .trim()
      .replace(/^["']|["']$/g, '') // 移除首尾引号
      .replace(/\n/g, ' ') // 移除换行
      .trim();

    if (!translated || translated.length === 0) {
      throw new Error('翻译结果为空');
    }

    return translated;
  } catch (error: any) {
    throw new Error(`翻译失败: ${error?.message || String(error)}`);
  }
}

/**
 * 批量翻译 Place 名称
 */
async function translateBatch(
  places: Array<{
    id: number;
    nameCN: string;
    nameEN: string | null;
  }>,
  llmService: LlmService,
  batchSize: number = 50,
  delayMs: number = 200
): Promise<{
  total: number;
  success: number;
  failed: number;
  skipped: number;
  errors: Array<{ placeId: number; name: string; error: string }>;
}> {
  let success = 0;
  let failed = 0;
  let skipped = 0;
  const errors: Array<{ placeId: number; name: string; error: string }> = [];

  console.log(`\n开始批量翻译，共 ${places.length} 个 Place`);
  console.log(`批量大小: ${batchSize}, 延迟: ${delayMs}ms\n`);

  // 分批处理
  for (let i = 0; i < places.length; i += batchSize) {
    const batch = places.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(places.length / batchSize);

    console.log(`处理批次 ${batchNum}/${totalBatches} (${batch.length} 个 Place)...`);

    // 串行处理当前批次（避免 API 限流）
    for (const place of batch) {
      try {
        // 检查是否已有 nameEN
        if (place.nameEN && place.nameEN.trim().length > 0) {
          console.log(`  Place ${place.id} (${place.nameCN}) 已有 nameEN，跳过`);
          skipped++;
          continue;
        }

        // 翻译
        const translated = await translateName(place.nameCN, llmService);
        
        console.log(`  Place ${place.id}: "${place.nameCN}" -> "${translated}"`);

        // 更新数据库（如果不是 dry-run）
        if (process.argv.includes('--dry-run')) {
          console.log(`  [DRY-RUN] 将更新 nameEN = "${translated}"`);
        } else {
          await prisma.place.update({
            where: { id: place.id },
            data: { nameEN: translated },
          });
        }

        success++;
      } catch (error: any) {
        console.log(`  ✗ Place ${place.id} (${place.nameCN}): 失败 - ${error.message}`);
        failed++;
        errors.push({
          placeId: place.id,
          name: place.nameCN,
          error: error?.message || String(error),
        });
      }

      // 延迟，避免 API 限流
      if (i + batchSize < places.length || place !== batch[batch.length - 1]) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    // 批次间延迟
    if (i + batchSize < places.length) {
      console.log(`  等待 ${delayMs}ms...\n`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return {
    total: places.length,
    success,
    failed,
    skipped,
    errors,
  };
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const batchSizeArg = args.find(arg => arg.startsWith('--batch-size='));
  const limitArg = args.find(arg => arg.startsWith('--limit='));

  const batchSize = batchSizeArg
    ? parseInt(batchSizeArg.split('=')[1], 10)
    : DEFAULT_BATCH_SIZE;
  const limit = limitArg
    ? parseInt(limitArg.split('=')[1], 10)
    : DEFAULT_LIMIT;

  console.log('=== 冰岛 POI 名称翻译脚本 ===\n');
  console.log(`模式: ${isDryRun ? 'DRY-RUN（仅预览）' : '执行模式'}`);
  console.log(`批次大小: ${batchSize}`);
  console.log(`处理限制: ${limit}\n`);

  let app;
  let llmService: LlmService | null = null;

  try {
    // 1. 先测试数据库连接（不依赖 NestJS）
    console.log('测试数据库连接...');
    try {
      await prisma.$connect();
      const testCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count FROM "Place" LIMIT 1
      `;
      console.log('✓ 数据库连接正常\n');
    } catch (error: any) {
      console.error('❌ 数据库连接失败:', error.message);
      throw error;
    }

    // 2. 初始化 NestJS 应用（用于获取 LlmService）
    console.log('初始化 NestJS 应用...');
    console.log('（这可能需要几秒钟，请耐心等待）\n');
    
    console.log('  正在创建应用上下文...');
    
    // 添加超时处理
    const initPromise = NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn'], // 只输出错误和警告
    });
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('应用初始化超时（60秒）')), 60000)
    );
    
    app = await Promise.race([initPromise, timeoutPromise]) as any;
    
    console.log('  正在获取 LlmService...');
    llmService = app.get(LlmService);
    if (!llmService) {
      throw new Error('LlmService 未找到');
    }
    console.log('  LlmService 获取成功');

    console.log('✓ NestJS 应用初始化完成\n');

    // 2. 查询需要翻译的冰岛 Place（nameEN 为空）
    console.log('查询需要翻译的冰岛 Place...');
    
    const totalCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "Place" p
      INNER JOIN "City" c ON p."cityId" = c.id
      WHERE c."countryCode" = 'IS'
        AND (p."nameEN" IS NULL OR p."nameEN" = '')
        AND p."nameCN" IS NOT NULL
        AND p."nameCN" != ''
    `;
    console.log(`  需要翻译的 Place 总数: ${totalCount[0]?.count || 0}`);

    // 查询需要翻译的 Place
    const icelandPlaces = await prisma.$queryRaw<Array<{
      id: number;
      nameCN: string;
      nameEN: string | null;
    }>>`
      SELECT 
        p.id,
        p."nameCN",
        p."nameEN"
      FROM "Place" p
      INNER JOIN "City" c ON p."cityId" = c.id
      WHERE c."countryCode" = 'IS'
        AND (p."nameEN" IS NULL OR p."nameEN" = '')
        AND p."nameCN" IS NOT NULL
        AND p."nameCN" != ''
      ORDER BY p.id
      LIMIT ${limit}
    `;

    console.log(`✓ 找到 ${icelandPlaces.length} 个需要翻译的 Place\n`);

    if (icelandPlaces.length === 0) {
      console.log('所有 Place 都已具备 nameEN，无需翻译。');
      return;
    }

    // 3. 显示统计信息
    console.log('统计信息:');
    const nameCNLengths = icelandPlaces.map(p => p.nameCN.length);
    const avgLength = nameCNLengths.reduce((a, b) => a + b, 0) / nameCNLengths.length;
    console.log(`  - 平均名称长度: ${avgLength.toFixed(1)} 字符`);
    console.log(`  - 最长名称: ${Math.max(...nameCNLengths)} 字符`);
    console.log(`  - 最短名称: ${Math.min(...nameCNLengths)} 字符\n`);

    // 4. 批量翻译
    const delayMs = parseInt(process.env.DELAY_MS || '200', 10);

    const results = await translateBatch(
      icelandPlaces,
      llmService,
      batchSize,
      delayMs
    );

    // 5. 显示结果统计
    console.log('\n=== 翻译完成 ===');
    console.log(`总计: ${results.total}`);
    console.log(`成功: ${results.success} (${(results.success / results.total * 100).toFixed(1)}%)`);
    console.log(`失败: ${results.failed} (${(results.failed / results.total * 100).toFixed(1)}%)`);
    console.log(`跳过: ${results.skipped} (${(results.skipped / results.total * 100).toFixed(1)}%)`);

    if (results.errors.length > 0) {
      console.log('\n失败详情（前 10 个）:');
      results.errors.slice(0, 10).forEach(err => {
        console.log(`  - Place ${err.placeId} (${err.name}): ${err.error}`);
      });
      if (results.errors.length > 10) {
        console.log(`  ... 还有 ${results.errors.length - 10} 个错误`);
      }
    }

  } catch (error: any) {
    console.error('\n❌ 脚本执行失败:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    // 清理资源
    if (app) {
      await app.close();
    }
    await prisma.$disconnect();
  }
}

// 运行脚本
if (require.main === module) {
  main().catch(error => {
    console.error('未处理的错误:', error);
    process.exit(1);
  });
}

export { main };
