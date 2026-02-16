/**
 * Place-知识库关联脚本
 * 
 * 功能：
 * 1. 基于地点名称和坐标搜索相关的知识库 chunks
 * 2. 将关联的 chunk IDs 存储在 Place.metadata.knowledgeBase 中
 * 3. 使用向量相似度搜索增强匹配
 * 
 * 使用方法：
 *   npx ts-node scripts/link-place-to-kb.ts
 *   npx ts-node scripts/link-place-to-kb.ts --dry-run
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 目的地国家代码到关键词的映射
const COUNTRY_KEYWORDS: Record<string, string[]> = {
  IS: ['iceland', 'icelandic', '冰岛', 'reykjavik', 'akureyri', 'golden circle', 'ring road'],
  NO: ['norway', 'norwegian', '挪威', 'lofoten', 'tromsø', 'oslo', 'bergen'],
  CH: ['switzerland', 'swiss', '瑞士', 'zermatt', 'matterhorn', 'alps', 'grindelwald'],
  NZ: ['new zealand', 'newzealand', '新西兰', 'queenstown', 'milford', 'auckland'],
  NP: ['nepal', 'nepalese', '尼泊尔', 'everest', 'kathmandu', 'annapurna', 'himalaya'],
  AR: ['argentina', 'argentine', '阿根廷', 'patagonia', 'ushuaia', 'calafate'],
  IT: ['italy', 'italian', '意大利', 'dolomites', 'cortina', 'alps'],
  GL: ['greenland', 'greenlandic', '格陵兰', 'ilulissat'],
  PE: ['peru', 'peruvian', '秘鲁', 'cusco', 'machu picchu', 'inca'],
  TZ: ['tanzania', '坦桑尼亚', 'kilimanjaro', 'serengeti'],
  CN: ['china', 'chinese', '中国', 'tibet', '西藏'],
};

interface PlaceInfo {
  id: number;
  uuid: string;
  nameEN: string;
  nameCN: string | null;
  cityId: number | null;
  metadata: Record<string, any> | null;
}

interface ChunkInfo {
  id: string;
  content: string;
  category: string | null;
  keywords: string[] | null;
}

async function findRelatedChunks(place: PlaceInfo, cityCountryCode: string | null): Promise<ChunkInfo[]> {
  const searchTerms: string[] = [];
  
  // 添加地点名称
  if (place.nameEN) {
    searchTerms.push(place.nameEN.toLowerCase());
  }
  if (place.nameCN) {
    searchTerms.push(place.nameCN);
  }
  
  // 添加国家相关关键词
  if (cityCountryCode && COUNTRY_KEYWORDS[cityCountryCode]) {
    searchTerms.push(...COUNTRY_KEYWORDS[cityCountryCode].slice(0, 3));
  }
  
  if (searchTerms.length === 0) {
    return [];
  }
  
  // 构建搜索条件
  const searchPattern = searchTerms.map(t => `%${t}%`).join('|');
  
  // 搜索 chunks
  const chunks = await prisma.$queryRaw<ChunkInfo[]>`
    SELECT id, content, category, keywords
    FROM chunks
    WHERE 
      content ILIKE ANY(ARRAY[${searchTerms.map(t => `%${t}%`)}])
      OR (keywords IS NOT NULL AND keywords::text ILIKE ANY(ARRAY[${searchTerms.map(t => `%${t}%`)}]))
    LIMIT 5
  `;
  
  return chunks;
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║              Place-知识库关联脚本                             ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  if (isDryRun) {
    console.log('🔍 运行模式: 仅检查\n');
  }
  
  // 获取 City 国家映射
  console.log('📋 步骤 1: 加载城市-国家映射...');
  const cities = await prisma.$queryRaw<any[]>`
    SELECT id, "countryCode" FROM "City"
  `;
  const cityCountryMap = new Map(cities.map((c: any) => [c.id, c.countryCode]));
  console.log(`   已加载 ${cityCountryMap.size} 个城市\n`);
  
  // 获取需要关联的 Place（名称匹配主要目的地）
  console.log('📋 步骤 2: 查找需要关联的 Place...');
  
  // 获取所有有名称的 Place（分批处理）
  const allPlaces = await prisma.$queryRaw<PlaceInfo[]>`
    SELECT p.id, p.uuid, p."nameEN", p."nameCN", p."cityId", p.metadata
    FROM "Place" p
    WHERE p."nameEN" IS NOT NULL
       OR p."nameCN" IS NOT NULL
  `;
  
  console.log(`   找到 ${allPlaces.length} 个有名称的 Place\n`);
  const places = allPlaces;
  
  // 预加载相关的 chunks（基于国家关键词）
  console.log('📋 步骤 3: 预加载知识库 chunks...');
  
  const allKeywords = Object.values(COUNTRY_KEYWORDS).flat();
  const relevantChunks = await prisma.$queryRaw<any[]>`
    SELECT id, content, category, keywords, metadata
    FROM chunks
    WHERE category IN ('POI_INFO', 'ROUTE_INFO', 'RISK_INFO', 'GEOGRAPHY', 'PRACTICAL', 'DECISION_SUPPORT')
    LIMIT 1000
  `;
  console.log(`   加载了 ${relevantChunks.length} 个相关 chunks\n`);
  
  // 建立简单的文本匹配索引
  const chunkIndex = new Map<string, any[]>();
  for (const chunk of relevantChunks) {
    const content = (chunk.content || '').toLowerCase();
    const keywords = chunk.keywords || [];
    
    // 提取可能的地点名称（简单分词）
    const words = content.split(/[\s,.:;!?()\[\]{}""'']+/).filter((w: string) => w.length > 3);
    
    for (const word of words) {
      if (!chunkIndex.has(word)) {
        chunkIndex.set(word, []);
      }
      if (!chunkIndex.get(word)!.includes(chunk)) {
        chunkIndex.get(word)!.push(chunk);
      }
    }
  }
  
  console.log(`   建立索引词数: ${chunkIndex.size}\n`);
  
  // 关联 Place 和 chunks
  console.log('📋 步骤 4: 建立关联...');
  
  let linkedCount = 0;
  let processedCount = 0;
  
  for (const place of places) {
    processedCount++;
    
    if (!place.nameEN) continue;
    
    const countryCode = place.cityId ? cityCountryMap.get(place.cityId) : null;
    
    // 查找匹配的 chunks
    const nameKey = place.nameEN.toLowerCase().split(/[\s,]+/)[0];
    const matchedChunks = chunkIndex.get(nameKey) || [];
    
    // 也尝试用中文名匹配
    let cnMatchedChunks: any[] = [];
    if (place.nameCN) {
      for (const [word, chunks] of chunkIndex.entries()) {
        if (chunks.some((c: any) => (c.content || '').includes(place.nameCN!))) {
          cnMatchedChunks.push(...chunks);
        }
      }
    }
    
    const allMatched = [...new Set([...matchedChunks, ...cnMatchedChunks])].slice(0, 3);
    
    if (allMatched.length > 0) {
      linkedCount++;
      
      if (!isDryRun) {
        const existingMetadata = place.metadata || {};
        const newMetadata = {
          ...existingMetadata,
          knowledgeBase: {
            linkedChunkIds: allMatched.map((c: any) => c.id),
            linkedAt: new Date().toISOString(),
            matchSource: 'name_text_match',
          },
        };
        
        await prisma.$executeRaw`
          UPDATE "Place"
          SET metadata = ${JSON.stringify(newMetadata)}::jsonb,
              "updatedAt" = NOW()
          WHERE id = ${place.id}
        `;
      }
      
      if (linkedCount <= 10) {
        console.log(`   ✓ ${place.nameEN}: 关联 ${allMatched.length} 个 chunks`);
      }
    }
    
    if (processedCount % 100 === 0) {
      process.stdout.write(`\r   已处理: ${processedCount}/${places.length}, 已关联: ${linkedCount}`);
    }
  }
  
  console.log(`\n\n📊 关联结果:`);
  console.log(`   处理 Place: ${processedCount}`);
  console.log(`   成功关联: ${linkedCount}`);
  console.log(`   关联率: ${((linkedCount / processedCount) * 100).toFixed(1)}%`);
  
  // 验证关联结果
  if (!isDryRun) {
    const verifyStats = await prisma.$queryRaw<any[]>`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN metadata->'knowledgeBase' IS NOT NULL THEN 1 END) as with_kb
      FROM "Place"
    `;
    
    console.log(`\n📈 最终统计:`);
    console.log(`   总 Place: ${verifyStats[0].total}`);
    console.log(`   有 KB 关联: ${verifyStats[0].with_kb}`);
  }
  
  console.log('\n✅ 脚本执行完成\n');
}

main()
  .catch((e) => {
    console.error('❌ 执行失败:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

export {};
