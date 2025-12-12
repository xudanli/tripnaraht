// scripts/scrape-alltrails-batch.ts

/**
 * 从 URL 列表文件批量爬取 AllTrails 路线
 * 
 * 使用方法:
 *   npm run scrape:alltrails:batch -- <urls_file.json>
 * 
 * 示例:
 *   npm run scrape:alltrails:batch -- tibet_trail_urls.json
 *   npm run scrape:alltrails:batch -- tibet_trail_urls.json --limit 20 --debug
 */

import * as fs from 'fs/promises';
import { parseTrailDetail, convertToSystemFormat, makeRequest } from './scrape-alltrails';

/**
 * 从文件读取 URL 列表
 */
async function readUrlList(filePath: string): Promise<string[]> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const urls = JSON.parse(content);
    
    if (Array.isArray(urls)) {
      return urls;
    } else if (typeof urls === 'object' && urls.urls) {
      return urls.urls;
    } else {
      throw new Error('URL 列表格式不正确，应该是字符串数组或包含 urls 字段的对象');
    }
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error(`文件不存在: ${filePath}`);
    }
    throw error;
  }
}

/**
 * 批量爬取路线
 */
async function batchScrapeTrails(
  urls: string[],
  limit?: number,
  debug: boolean = false
): Promise<any[]> {
  const allTrails: any[] = [];
  const total = limit ? Math.min(limit, urls.length) : urls.length;

  console.log(`\n🚀 开始批量爬取 ${total} 条路线...\n`);

  for (let i = 0; i < total; i++) {
    const trailUrl = urls[i];
    console.log(`[${i + 1}/${total}] 正在处理: ${trailUrl}`);

    try {
      // 增加延时，避免被封（3-5 秒随机延时）
      const delay = 3000 + Math.random() * 2000;
      const detailHtml = await makeRequest(trailUrl, delay, undefined, 3, true, false);
      
      if (detailHtml) {
        const trail = parseTrailDetail(detailHtml, trailUrl, debug);
        const systemFormat = convertToSystemFormat(trail);
        allTrails.push(systemFormat);
        console.log(`  ✅ 已抓取: ${trail.name || 'Unknown'}`);
        
        // 每抓取 5 条路线，保存一次（防止数据丢失）
        if ((i + 1) % 5 === 0) {
          const tempFile = `alltrails_batch_temp_${Date.now()}.json`;
          await fs.writeFile(tempFile, JSON.stringify(allTrails, null, 2), 'utf-8');
          console.log(`  💾 临时保存到: ${tempFile} (已抓取 ${i + 1} 条)`);
        }
      } else {
        console.log(`  ⚠️  跳过，无法获取页面`);
      }
    } catch (error: any) {
      console.error(`  ❌ 处理失败: ${error.message}`);
    }
  }

  return allTrails;
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
使用方法:
  npm run scrape:alltrails:batch -- <urls_file.json> [--limit <number>] [--debug]

参数:
  <urls_file.json>  - URL 列表文件（JSON 格式，字符串数组）
  --limit <number> - 可选，限制爬取数量（默认爬取所有）
  --debug          - 可选，启用调试模式

示例:
  npm run scrape:alltrails:batch -- tibet_trail_urls.json
  npm run scrape:alltrails:batch -- tibet_trail_urls.json --limit 20
  npm run scrape:alltrails:batch -- tibet_trail_urls.json --limit 50 --debug

URL 列表文件格式:
  [
    "https://www.alltrails.com/trail/iceland/southern/trail-1",
    "https://www.alltrails.com/trail/iceland/southern/trail-2",
    ...
  ]

或者:
  {
    "urls": [
      "https://www.alltrails.com/trail/iceland/southern/trail-1",
      ...
    ]
  }
    `);
    process.exit(0);
  }

  const filePath = args[0];
  const limit = args.includes('--limit') 
    ? parseInt(args[args.indexOf('--limit') + 1]) 
    : undefined;
  const debug = args.includes('--debug');

  try {
    console.log(`📂 正在读取 URL 列表: ${filePath}`);
    const urls = await readUrlList(filePath);
    console.log(`📋 找到 ${urls.length} 个 URL`);

    if (urls.length === 0) {
      console.error('❌ URL 列表为空');
      process.exit(1);
    }

    const allTrails = await batchScrapeTrails(urls, limit, debug);

    // 保存最终结果
    const outputFile = `alltrails_batch_${Date.now()}.json`;
    await fs.writeFile(outputFile, JSON.stringify(allTrails, null, 2), 'utf-8');
    
    console.log(`\n✅ 批量爬取完成！`);
    console.log(`📊 统计:`);
    console.log(`   - 总 URL 数: ${urls.length}`);
    console.log(`   - 成功爬取: ${allTrails.length}`);
    console.log(`   - 失败/跳过: ${urls.length - allTrails.length}`);
    console.log(`\n💾 数据已保存到: ${outputFile}`);

  } catch (error: any) {
    console.error(`❌ 错误: ${error.message}`);
    process.exit(1);
  }
}

// 运行
if (require.main === module) {
  main().catch(console.error);
}

