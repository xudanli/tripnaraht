/**
 * 冰岛 POI 名称翻译脚本（简化版）
 * 
 * 直接调用 LLM API，不依赖 NestJS 初始化
 * 
 * 使用方法：
 *   tsx scripts/translate-iceland-poi-names-simple.ts [--dry-run] [--batch-size=50] [--limit=1000]
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';
import axios from 'axios';
import https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';

// 加载 .env 文件
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

// 配置
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_LIMIT = 1000;

// 获取 LLM 配置
function getLlmConfig() {
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  // 优先使用 DeepSeek（更便宜）
  if (deepseekKey) {
    return {
      provider: 'deepseek',
      apiKey: deepseekKey,
      baseUrl: 'https://api.deepseek.com/v1',
    };
  }
  
  if (openaiKey) {
    return {
      provider: 'openai',
      apiKey: openaiKey,
      baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    };
  }

  if (anthropicKey) {
    return {
      provider: 'anthropic',
      apiKey: anthropicKey,
      baseUrl: 'https://api.anthropic.com/v1',
    };
  }

  throw new Error('未找到任何 LLM API Key（需要 DEEPSEEK_API_KEY、OPENAI_API_KEY 或 ANTHROPIC_API_KEY）');
}

/**
 * 使用 LLM API 翻译中文名称到英文
 */
async function translateName(nameCN: string, config: ReturnType<typeof getLlmConfig>): Promise<string> {
  if (!nameCN || nameCN.trim().length === 0) {
    throw new Error('nameCN 不能为空');
  }

  // 构建翻译提示词
  const prompt = `请将以下中文地名翻译成英文。只返回英文翻译，不要包含任何解释或其他内容。

中文名称：${nameCN}

英文翻译：`;

  try {
    let response: string;

    if (config.provider === 'deepseek' || config.provider === 'openai') {
      // OpenAI 兼容 API
      const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.ALL_PROXY;
      const httpsAgent = proxyUrl
        ? new HttpsProxyAgent(proxyUrl)
        : new https.Agent({ keepAlive: true, family: 4 });

      const apiResponse = await axios.post(
        `${config.baseUrl}/chat/completions`,
        {
          model: config.provider === 'deepseek' ? 'deepseek-chat' : 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 100,
        },
        {
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
          },
          httpsAgent,
          timeout: 30000,
        }
      );

      response = apiResponse.data.choices[0]?.message?.content || '';
    } else if (config.provider === 'anthropic') {
      // Anthropic API
      const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.ALL_PROXY;
      const httpsAgent = proxyUrl
        ? new HttpsProxyAgent(proxyUrl)
        : new https.Agent({ keepAlive: true, family: 4 });

      const apiResponse = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: 'claude-3-haiku-20240307',
          max_tokens: 100,
          messages: [{ role: 'user', content: prompt }],
        },
        {
          headers: {
            'x-api-key': config.apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          httpsAgent,
          timeout: 30000,
        }
      );

      response = apiResponse.data.content[0]?.text || '';
    } else {
      throw new Error(`不支持的 LLM provider: ${config.provider}`);
    }

    // 清理响应
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
  config: ReturnType<typeof getLlmConfig>,
  batchSize: number = 50,
  delayMs: number = 200,
  isDryRun: boolean = false
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
        const translated = await translateName(place.nameCN, config);
        
        console.log(`  Place ${place.id}: "${place.nameCN}" -> "${translated}"`);

        // 更新数据库（如果不是 dry-run）
        if (isDryRun) {
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

  console.log('=== 冰岛 POI 名称翻译脚本（简化版）===\n');
  console.log(`模式: ${isDryRun ? 'DRY-RUN（仅预览）' : '执行模式'}`);
  console.log(`批次大小: ${batchSize}`);
  console.log(`处理限制: ${limit}\n`);

  try {
    // 1. 获取 LLM 配置
    console.log('检查 LLM 配置...');
    const llmConfig = getLlmConfig();
    console.log(`✓ 使用 ${llmConfig.provider} API\n`);

    // 2. 测试数据库连接
    console.log('测试数据库连接...');
    await prisma.$connect();
    console.log('✓ 数据库连接正常\n');

    // 3. 查询需要翻译的冰岛 Place
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

    // 4. 批量翻译
    const delayMs = parseInt(process.env.DELAY_MS || '200', 10);

    const results = await translateBatch(
      icelandPlaces,
      llmConfig,
      batchSize,
      delayMs,
      isDryRun
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
