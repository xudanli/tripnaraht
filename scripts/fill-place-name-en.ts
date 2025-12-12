// scripts/fill-place-name-en.ts
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const prisma = new PrismaClient();

// Google Places API 配置
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const GOOGLE_PLACES_BASE_URL = 'https://maps.googleapis.com/maps/api/place';

// Google Translate API 配置（作为备选方案）
const GOOGLE_TRANSLATE_API_KEY = process.env.GOOGLE_TRANSLATE_API_KEY || GOOGLE_PLACES_API_KEY;
const GOOGLE_TRANSLATE_BASE_URL = 'https://translation.googleapis.com/language/translate/v2';

/**
 * 从 Google Places API 获取地点英文名称
 */
async function getPlaceNameFromGoogle(googlePlaceId: string): Promise<string | null> {
  if (!GOOGLE_PLACES_API_KEY) {
    return null;
  }

  try {
    const url = `${GOOGLE_PLACES_BASE_URL}/details/json`;
    const params = {
      place_id: googlePlaceId,
      fields: 'name',
      key: GOOGLE_PLACES_API_KEY,
      language: 'en', // 获取英文名称
    };

    const response = await axios.get(url, { params, timeout: 10000 });
    
    if (response.data.status === 'OK' && response.data.result?.name) {
      return response.data.result.name;
    }
    
    return null;
  } catch (error: any) {
    console.error(`  ❌ Google Places API 调用失败: ${error.message}`);
    return null;
  }
}

/**
 * 使用 Google Translate API 翻译中文名称
 */
async function translateNameToEnglish(nameCN: string): Promise<string | null> {
  if (!GOOGLE_TRANSLATE_API_KEY) {
    return null;
  }

  try {
    const url = `${GOOGLE_TRANSLATE_BASE_URL}?key=${GOOGLE_TRANSLATE_API_KEY}`;
    const data = {
      q: nameCN,
      source: 'zh',
      target: 'en',
      format: 'text',
    };

    const response = await axios.post(url, data, { timeout: 10000 });
    
    if (response.data?.data?.translations?.[0]?.translatedText) {
      return response.data.data.translations[0].translatedText;
    }
    
    return null;
  } catch (error: any) {
    console.error(`  ❌ Google Translate API 调用失败: ${error.message}`);
    return null;
  }
}

/**
 * 填充 Place 的 nameEN 字段
 */
async function fillPlaceNameEN() {
  console.log('🚀 开始填充 Place.nameEN 字段...\n');

  // 获取所有需要填充 nameEN 的地点
  const places = await prisma.place.findMany({
    where: {
      nameEN: null,
    },
    select: {
      id: true,
      nameCN: true,
      nameEN: true,
      googlePlaceId: true,
      category: true,
    },
    orderBy: {
      id: 'asc',
    },
  });

  console.log(`📊 找到 ${places.length} 个需要填充 nameEN 的地点\n`);
  console.log('━'.repeat(60));

  let updatedCount = 0;
  let googlePlacesCount = 0;
  let translateCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  // 分批处理，避免API限流
  const batchSize = 10;
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  for (let i = 0; i < places.length; i += batchSize) {
    const batch = places.slice(i, i + batchSize);
    
    console.log(`\n处理批次 ${Math.floor(i / batchSize) + 1}/${Math.ceil(places.length / batchSize)} (${batch.length} 个地点)`);

    for (const place of batch) {
      try {
        let nameEN: string | null = null;
        let source = '';

        // 策略1: 如果有 googlePlaceId，优先使用 Google Places API
        if (place.googlePlaceId) {
          nameEN = await getPlaceNameFromGoogle(place.googlePlaceId);
          if (nameEN) {
            source = 'Google Places';
            googlePlacesCount++;
          }
        }

        // 策略2: 如果 Google Places 失败，使用翻译服务
        // 只翻译景点、餐厅、购物等需要国际化的类别
        if (!nameEN) {
          const translatableCategories = ['ATTRACTION', 'RESTAURANT', 'SHOPPING', 'HOTEL'];
          if (translatableCategories.includes(place.category)) {
            nameEN = await translateNameToEnglish(place.nameCN);
            if (nameEN) {
              source = 'Google Translate';
              translateCount++;
            }
          } else {
            skippedCount++;
            console.log(`  ⏭️  [${place.id}] ${place.nameCN} - 跳过（类别: ${place.category}）`);
            continue;
          }
        }

        if (nameEN) {
          await prisma.place.update({
            where: { id: place.id },
            data: { nameEN },
          });
          updatedCount++;
          console.log(`  ✅ [${place.id}] ${place.nameCN} → ${nameEN} (${source})`);
        } else {
          failedCount++;
          console.log(`  ❌ [${place.id}] ${place.nameCN} - 无法获取英文名称`);
        }

        // 避免API限流
        await delay(200); // 200ms 延迟

      } catch (error: any) {
        failedCount++;
        console.error(`  ❌ [${place.id}] ${place.nameCN} - 错误: ${error.message}`);
      }
    }

    // 批次间延迟
    if (i + batchSize < places.length) {
      console.log(`\n⏸️  等待 1 秒后继续下一批次...`);
      await delay(1000);
    }
  }

  console.log('\n' + '━'.repeat(60));
  console.log('📊 填充统计:');
  console.log(`   总地点数: ${places.length}`);
  console.log(`   成功更新: ${updatedCount}`);
  console.log(`   - Google Places API: ${googlePlacesCount}`);
  console.log(`   - Google Translate API: ${translateCount}`);
  console.log(`   跳过: ${skippedCount}`);
  console.log(`   失败: ${failedCount}`);
  console.log('━'.repeat(60));

  // 验证结果
  const stats = await prisma.place.aggregate({
    _count: { nameEN: true },
    where: { nameEN: { not: null } },
  });

  const totalCount = await prisma.place.count();
  console.log(`\n📈 总体统计: nameEN填充率: ${stats._count.nameEN}/${totalCount} (${((stats._count.nameEN / totalCount) * 100).toFixed(1)}%)`);
}

// 运行脚本
fillPlaceNameEN()
  .catch((error) => {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
