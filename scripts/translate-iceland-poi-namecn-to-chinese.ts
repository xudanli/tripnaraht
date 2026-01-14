/**
 * 冰岛 POI nameCN 翻译成中文脚本
 * 
 * 用途：
 * - 将 nameCN 字段从英文翻译成中文
 * - 如果 nameEN 为空，则将翻译后的中文也填入 nameEN（作为英文名称）
 * 
 * 使用方法：
 *   tsx scripts/translate-iceland-poi-namecn-to-chinese.ts [--dry-run] [--batch-size=50] [--limit=1000]
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
 * 判断文本是否为英文（简单判断）
 */
function isEnglish(text: string): boolean {
  // 检查是否包含中文字符
  const chineseRegex = /[\u4e00-\u9fa5]/;
  return !chineseRegex.test(text);
}

/**
 * 使用 LLM API 将英文翻译成中文
 */
async function translateToChinese(englishText: string, config: ReturnType<typeof getLlmConfig>): Promise<string> {
  if (!englishText || englishText.trim().length === 0) {
    throw new Error('文本不能为空');
  }

  // 构建翻译提示词
  const prompt = `请将以下英文地名翻译成中文。只返回中文翻译，不要包含任何解释或其他内容。

英文名称：${englishText}

中文翻译：`;

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
        // 检查 nameCN 是否为英文
        if (!isEnglish(place.nameCN)) {
          console.log(`  Place ${place.id} (${place.nameCN}) nameCN 已经是中文，跳过`);
          skipped++;
          continue;
        }

        // 翻译 nameCN 到中文
        const chineseName = await translateToChinese(place.nameCN, config);
        
        console.log(`  Place ${place.id}: "${place.nameCN}" -> "${chineseName}"`);

        // 更新数据库（如果不是 dry-run）
        if (isDryRun) {
          console.log(`  [DRY-RUN] 将更新 nameCN = "${chineseName}"`);
          if (!place.nameEN) {
            console.log(`  [DRY-RUN] 将更新 nameEN = "${place.nameCN}" (保留原英文)`);
          }
        } else {
          const updateData: any = {
            nameCN: chineseName,
          };
          
          // 如果 nameEN 为空，将原英文名称填入 nameEN
          if (!place.nameEN || place.nameEN.trim() === '') {
            updateData.nameEN = place.nameCN;
          }
          
          await prisma.place.update({
            where: { id: place.id },
            data: updateData,
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

  console.log('=== 冰岛 POI nameCN 翻译成中文脚本 ===\n');
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

    // 3. 查询需要翻译的冰岛 Place（nameCN 是英文的）
    console.log('查询需要翻译的冰岛 Place...');
    
    const totalCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "Place" p
      INNER JOIN "City" c ON p."cityId" = c.id
      WHERE c."countryCode" = 'IS'
        AND p."nameCN" IS NOT NULL
        AND p."nameCN" != ''
    `;
    console.log(`  冰岛 Place 总数: ${totalCount[0]?.count || 0}`);

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
        AND p."nameCN" IS NOT NULL
        AND p."nameCN" != ''
      ORDER BY p.id
      LIMIT ${limit}
    `;

    console.log(`✓ 找到 ${icelandPlaces.length} 个 Place\n`);

    if (icelandPlaces.length === 0) {
      console.log('没有需要处理的 Place。');
      return;
    }

    // 4. 过滤出 nameCN 是英文的记录
    const placesToTranslate = icelandPlaces.filter(p => isEnglish(p.nameCN));
    console.log(`  其中 nameCN 是英文的: ${placesToTranslate.length} 个\n`);

    if (placesToTranslate.length === 0) {
      console.log('所有 Place 的 nameCN 都已经是中文，无需翻译。');
      return;
    }

    // 5. 批量翻译
    const delayMs = parseInt(process.env.DELAY_MS || '200', 10);

    const results = await translateBatch(
      placesToTranslate,
      llmConfig,
      batchSize,
      delayMs,
      isDryRun
    );

    // 6. 显示结果统计
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
