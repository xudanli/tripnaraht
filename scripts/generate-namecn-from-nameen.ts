#!/usr/bin/env ts-node
/**
 * 根据 Place 表的 nameEN 字段生成 nameCN 字段
 * 
 * 功能：
 * 1. 查找有 nameEN 但没有 nameCN 的 Place
 * 2. 使用 DeepSeek API 将英文名称翻译成中文
 * 3. 支持按 cityId 过滤
 * 4. 批量处理，支持断点续传
 * 
 * 使用方法:
 *   npm run generate:namecn -- --all                    # 处理所有符合条件的 Place
 *   npm run generate:namecn -- --limit 100               # 只处理前 100 个
 *   npm run generate:namecn -- --cityId 123              # 只处理指定 cityId 的 Place
 *   npm run generate:namecn -- --dry-run                 # 预览模式，不实际更新
 * 
 * 示例:
 *   npm run generate:namecn -- --all
 *   npm run generate:namecn -- --cityId 123 --limit 50
 *   npm run generate:namecn -- --limit 50 --dry-run
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import axios from 'axios';
import dns from 'node:dns';
import https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { retryWithBackoff } from '../src/llm/utils/retry-with-backoff';

const prisma = new PrismaClient();

// 强制 IPv4 优先
dns.setDefaultResultOrder('ipv4first');

/**
 * 创建 DeepSeek HTTP 客户端
 */
function createDeepSeekHttp(baseUrl: string): any {
  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.ALL_PROXY ||
    process.env.all_proxy;

  const httpsAgent = proxyUrl
    ? new HttpsProxyAgent<string>(proxyUrl)
    : new https.Agent({
        keepAlive: true,
        family: 4, // 强制 IPv4
      });

  return axios.create({
    baseURL: baseUrl,
    httpsAgent,
    timeout: 60000,
  });
}

/**
 * 翻译英文名称到中文（使用 DeepSeek）
 */
async function translateToChinese(
  nameEN: string,
  deepseekHttp: any,
  apiKey: string
): Promise<string> {
  const prompt = `请将以下英文地点名称翻译成中文。只返回翻译后的中文名称，不要添加任何解释或标点符号。

英文名称: ${nameEN}

中文名称:`;

  try {
    const response = await retryWithBackoff(
      () => deepseekHttp.post(
        '/chat/completions',
        {
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: '你是一个专业的地名翻译助手。请将英文地名翻译成准确、自然的中文名称。只返回翻译结果，不要添加任何解释。'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3,
          max_tokens: 50,
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      ),
      {
        maxRetries: 3,
        initialDelayMs: 200,
        maxDelayMs: 2000,
        factor: 2,
        jitter: true,
      }
    ) as any;

    if (response.data && response.data.choices && response.data.choices.length > 0) {
      const translated = response.data.choices[0].message.content.trim();
      // 清理可能的引号或其他符号
      return translated.replace(/^["']|["']$/g, '').trim();
    }

    throw new Error('DeepSeek API 返回格式错误');
  } catch (error: any) {
    if (error.response) {
      const errorMsg = error.response.data?.error?.message || error.response.statusText || 'Unknown error';
      throw new Error(`DeepSeek API 错误 (${error.response.status}): ${errorMsg}`);
    }
    throw error;
  }
}

/**
 * 生成 nameCN
 */
async function generateNameCN() {
  console.log('🔄 开始根据 nameEN 生成 nameCN...\n');

  // 创建 NestJS 应用上下文
  const app = await NestFactory.createApplicationContext(AppModule);
  const configService = app.get(ConfigService);

  try {
    // 检查 API Key
    const apiKey = process.env.DEEPSEEK_API_KEY || configService.get<string>('DEEPSEEK_API_KEY');
    if (!apiKey || apiKey.includes('your_api_key') || apiKey.length < 20) {
      console.error('❌ DEEPSEEK_API_KEY 未配置或无效');
      console.error('请在 .env 文件中配置有效的 API Key:');
      console.error('  DEEPSEEK_API_KEY=sk-...');
      return { generated: 0, errors: 0, skipped: 0 };
    }

    const baseUrl = process.env.DEEPSEEK_BASE_URL || configService.get<string>('DEEPSEEK_BASE_URL') || 'https://api.deepseek.com/v1';
    const deepseekHttp = createDeepSeekHttp(baseUrl);

    console.log(`✅ 使用 DeepSeek API (Base URL: ${baseUrl})\n`);

    // 解析命令行参数
    const args = process.argv.slice(2);
    const limitIndex = args.indexOf('--limit');
    const limit = limitIndex !== -1 ? parseInt(args[limitIndex + 1]) : 10000;
    const cityIdIndex = args.indexOf('--cityId');
    const cityId = cityIdIndex !== -1 ? parseInt(args[cityIdIndex + 1]) : null;
    const dryRun = args.includes('--dry-run');
    const allFlag = args.includes('--all');

    if (dryRun) {
      console.log('⚠️  预览模式：不会实际更新数据库\n');
    }

    if (cityId) {
      console.log(`📍 只处理 cityId = ${cityId} 的 Place\n`);
    }

    // 查询有 nameEN 但没有 nameCN 的 Place
    const placesWithoutNameCN = await prisma.$queryRaw<Array<{
      id: number;
      nameCN: string;
      nameEN: string;
      category: string;
      cityId: number | null;
    }>>`
      SELECT 
        id,
        "nameCN",
        "nameEN",
        category,
        "cityId"
      FROM "Place"
      WHERE "nameEN" IS NOT NULL
        AND "nameEN" != ''
        AND ("nameCN" IS NULL OR "nameCN" = '' OR "nameCN" = "nameEN")
        ${cityId ? Prisma.sql`AND "cityId" = ${cityId}` : Prisma.sql``}
      ORDER BY id
      LIMIT ${allFlag ? 100000 : limit}
    `;

    console.log(`找到 ${placesWithoutNameCN.length} 个需要生成 nameCN 的 Place\n`);

    if (placesWithoutNameCN.length === 0) {
      console.log('✅ 没有需要处理的 Place\n');
      return { generated: 0, errors: 0, skipped: 0 };
    }

    // 批量处理
    const batchSize = 10; // 每批处理10个
    let generated = 0;
    let errors = 0;
    let skipped = 0;

    for (let i = 0; i < placesWithoutNameCN.length; i += batchSize) {
      const batch = placesWithoutNameCN.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(placesWithoutNameCN.length / batchSize);

      console.log(`处理批次 ${batchNumber}/${totalBatches} (${batch.length} 个地点)...`);

      for (const place of batch) {
        try {
          // 翻译 nameEN 到 nameCN
          const translated = await translateToChinese(place.nameEN, deepseekHttp, apiKey);
          
          if (dryRun) {
            console.log(`  📝 Place ${place.id}: "${place.nameEN}" -> "${translated}" (预览)`);
            generated++;
          } else {
            // 更新数据库
            await prisma.$executeRaw`
              UPDATE "Place"
              SET "nameCN" = ${translated},
                  "updatedAt" = NOW()
              WHERE id = ${place.id}
            `;
            console.log(`  ✅ Place ${place.id}: "${place.nameEN}" -> "${translated}"`);
            generated++;
          }

          // 延迟以避免 API 限流
          await new Promise((resolve) => setTimeout(resolve, 200));
        } catch (error: any) {
          errors++;
          const errorMsg = error.message || error.toString() || 'Unknown error';
          console.error(`  ❌ Place ${place.id} (${place.nameEN}) - 失败: ${errorMsg}`);
          
          // 如果是 API 错误，稍作延迟后继续
          if (error.response?.status === 429) {
            console.log('  ⏳ API 限流，等待 5 秒后继续...');
            await new Promise((resolve) => setTimeout(resolve, 5000));
          }
        }
      }

      // 批次间延迟
      if (i + batchSize < placesWithoutNameCN.length) {
        console.log('  等待 1 秒后继续下一批次...\n');
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    console.log('\n✅ 生成完成！');
    console.log(`  - 成功: ${generated}`);
    console.log(`  - 跳过: ${skipped}`);
    console.log(`  - 失败: ${errors}`);
    console.log(`  - 总计: ${placesWithoutNameCN.length}\n`);

    return { generated, errors, skipped };
  } finally {
    await app.close();
  }
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log('使用方法:');
    console.log('  npm run generate:namecn -- --all              # 处理所有符合条件的 Place');
    console.log('  npm run generate:namecn -- --limit 100        # 只处理前 100 个');
    console.log('  npm run generate:namecn -- --cityId 123       # 只处理指定 cityId 的 Place');
    console.log('  npm run generate:namecn -- --dry-run          # 预览模式，不实际更新');
    console.log('\n示例:');
    console.log('  npm run generate:namecn -- --all');
    console.log('  npm run generate:namecn -- --cityId 123 --limit 50');
    console.log('  npm run generate:namecn -- --limit 50 --dry-run');
    process.exit(0);
  }

  console.log('🚀 开始根据 nameEN 生成 nameCN...\n');
  console.log('='.repeat(60) + '\n');

  try {
    await generateNameCN();
    console.log('✅ 所有操作完成！\n');
  } catch (error: any) {
    console.error('❌ 操作失败:', error.message);
    throw error;
  }
}

main()
  .catch((error) => {
    console.error('❌ 失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

