// scripts/scrape-fliggy-attractions.ts
// 爬取飞猪景点数据

import axios from 'axios';
import * as cheerio from 'cheerio';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

// 配置
const CONFIG = {
  delay: 2000, // 请求延迟（毫秒）
  maxRetries: 3,
  batchSize: 10,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
};

interface FliggyAttraction {
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  rating?: number;
  description?: string;
  phone?: string;
  website?: string;
  openingHours?: string;
  ticketPrice?: string;
  images?: string[];
  city?: string;
}

/**
 * 创建axios实例
 */
function createAxiosInstance() {
  return axios.create({
    timeout: 30000,
    headers: {
      'User-Agent': CONFIG.userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
  });
}

/**
 * 延迟函数
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 搜索飞猪景点
 */
async function searchAttractions(keyword: string, city?: string): Promise<string[]> {
  const axiosInstance = createAxiosInstance();
  const attractionUrls: string[] = [];

  try {
    // 飞猪景点搜索URL（需要根据实际网站结构调整）
    const searchUrl = `https://www.fliggy.com/search?q=${encodeURIComponent(keyword)}${city ? `&city=${city}` : ''}`;

    console.log(`🔍 搜索: ${keyword}${city ? ` (${city})` : ''}`);

    const response = await axiosInstance.get(searchUrl);
    const $ = cheerio.load(response.data);

    // 解析搜索结果（需要根据飞猪实际页面结构调整）
    $('a[href*="/scenic"]').each((_, element) => {
      const link = $(element).attr('href');
      if (link) {
        const fullUrl = link.startsWith('http') ? link : `https://www.fliggy.com${link}`;
        if (!attractionUrls.includes(fullUrl)) {
          attractionUrls.push(fullUrl);
        }
      }
    });

    console.log(`   找到 ${attractionUrls.length} 个景点链接`);
    await sleep(CONFIG.delay);

    return attractionUrls;
  } catch (error: any) {
    console.error(`❌ 搜索失败: ${error.message}`);
    return [];
  }
}

/**
 * 爬取单个景点详情
 */
async function scrapeAttractionDetail(url: string): Promise<FliggyAttraction | null> {
  const axiosInstance = createAxiosInstance();
  let retries = 0;

  while (retries < CONFIG.maxRetries) {
    try {
      console.log(`📥 爬取: ${url}`);

      const response = await axiosInstance.get(url);
      const $ = cheerio.load(response.data);

      const attraction: FliggyAttraction = {
        name: '',
      };

      // 提取名称
      attraction.name = $('h1, .title, [class*="title"]').first().text().trim() ||
                       $('title').text().replace(' - 飞猪', '').trim();

      // 提取地址
      attraction.address = $('.address, [class*="address"]').first().text().trim();

      // 提取评分
      const ratingText = $('.score, .rating').first().text().trim();
      const ratingMatch = ratingText.match(/(\d+\.?\d*)/);
      if (ratingMatch) {
        attraction.rating = parseFloat(ratingMatch[1]);
      }

      // 提取描述
      attraction.description = $('.summary, .description').first().text().trim();

      // 提取门票价格
      const priceText = $('.price, [class*="price"]').first().text().trim();
      if (priceText) {
        attraction.ticketPrice = priceText;
      }

      // 提取开放时间
      const hoursText = $('.hours, .opening-hours').first().text().trim();
      if (hoursText) {
        attraction.openingHours = hoursText;
      }

      // 提取图片
      const images: string[] = [];
      $('img').each((_, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src');
        if (src && !src.includes('avatar') && !src.includes('logo')) {
          const fullUrl = src.startsWith('http') ? src : `https:${src}`;
          images.push(fullUrl);
        }
      });
      attraction.images = images.slice(0, 5);

      if (!attraction.name) {
        console.warn(`⚠️  跳过：无法提取景点名称 (${url})`);
        return null;
      }

      console.log(`✅ 成功: ${attraction.name}`);
      await sleep(CONFIG.delay);

      return attraction;
    } catch (error: any) {
      retries++;
      if (retries >= CONFIG.maxRetries) {
        console.error(`❌ 爬取失败: ${url} - ${error.message}`);
        return null;
      }
      await sleep(CONFIG.delay * retries);
    }
  }

  return null;
}

/**
 * 保存景点到数据库
 */
async function saveAttraction(attraction: FliggyAttraction, cityId?: number): Promise<boolean> {
  try {
    // 检查是否已存在
    const existing = await prisma.place.findFirst({
      where: {
        nameCN: attraction.name,
        category: 'ATTRACTION',
      },
    });

    if (existing) {
      console.log(`⏭️  已存在: ${attraction.name}`);
      return false;
    }

    // 创建Place
    const place = await prisma.place.create({
      data: {
        uuid: randomUUID(),
        nameCN: attraction.name,
        category: 'ATTRACTION',
        address: attraction.address || null,
        cityId: cityId || null,
        rating: attraction.rating || null,
        metadata: {
          source: 'fliggy',
          description: attraction.description,
          phone: attraction.phone,
          website: attraction.website,
          openingHours: attraction.openingHours,
          ticketPrice: attraction.ticketPrice,
          images: attraction.images,
          city: attraction.city,
          crawledAt: new Date().toISOString(),
        } as any,
        updatedAt: new Date(),
      } as any,
    });

    // 如果有坐标，更新location
    if (attraction.lat && attraction.lng) {
      await prisma.$executeRaw`
        UPDATE "Place"
        SET location = ST_SetSRID(ST_MakePoint(${attraction.lng}, ${attraction.lat}), 4326)
        WHERE id = ${place.id}
      `;
    }

    return true;
  } catch (error: any) {
    console.error(`❌ 保存失败: ${attraction.name} - ${error.message}`);
    return false;
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 开始爬取飞猪景点数据...\n');

  const keywords = process.argv.slice(2);
  
  if (keywords.length === 0) {
    console.log('📝 使用示例:');
    console.log('   npm run scrape:fliggy 北京 上海');
    console.log('   或修改脚本中的默认关键词\n');
    keywords.push('北京', '上海');
  }

  let totalFound = 0;
  let totalSaved = 0;
  let totalFailed = 0;

  for (const keyword of keywords) {
    try {
      const urls = await searchAttractions(keyword);
      totalFound += urls.length;

      if (urls.length === 0) {
        console.warn(`⚠️  未找到景点: ${keyword}\n`);
        continue;
      }

      for (let i = 0; i < urls.length; i += CONFIG.batchSize) {
        const batch = urls.slice(i, i + CONFIG.batchSize);

        for (const url of batch) {
          const attraction = await scrapeAttractionDetail(url);
          
          if (attraction) {
            const saved = await saveAttraction(attraction);
            if (saved) {
              totalSaved++;
            }
          } else {
            totalFailed++;
          }
        }

        await sleep(CONFIG.delay);
      }
    } catch (error: any) {
      console.error(`❌ 处理失败: ${keyword} - ${error.message}`);
      totalFailed++;
    }
  }

  console.log(`\n✅ 完成！`);
  console.log(`  找到链接: ${totalFound}`);
  console.log(`  成功保存: ${totalSaved}`);
  console.log(`  失败: ${totalFailed}`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('❌ 脚本执行失败:', error);
  process.exit(1);
});
