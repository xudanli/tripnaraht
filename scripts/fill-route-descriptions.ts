/**
 * 补充 RouteDirection 描述数据
 * 
 * 功能：
 * 1. 为缺失描述的路线生成默认描述
 * 2. 基于路线名称、国家和标签生成描述
 * 
 * 使用方法：
 *   npx ts-node scripts/fill-route-descriptions.ts
 *   npx ts-node scripts/fill-route-descriptions.ts --dry-run
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 国家描述模板
const COUNTRY_DESCRIPTIONS: Record<string, { adjective: string; features: string }> = {
  IS: { adjective: '冰岛', features: '壮观的冰川、火山地貌和北极光' },
  NO: { adjective: '挪威', features: '峡湾、北极圈风光和午夜阳光' },
  CH: { adjective: '瑞士', features: '阿尔卑斯山脉、高山牧场和精准的交通系统' },
  NZ: { adjective: '新西兰', features: '原始自然、壮丽山脉和毛利文化' },
  NP: { adjective: '尼泊尔', features: '喜马拉雅山脉、珠峰和丰富的徒步文化' },
  AR: { adjective: '阿根廷', features: '巴塔哥尼亚冰川、安第斯山脉和探戈文化' },
  GL: { adjective: '格陵兰', features: '北极荒野、巨型冰山和因纽特文化' },
  IT: { adjective: '意大利', features: '多洛米蒂山脉、历史遗迹和美食' },
  SJ: { adjective: '斯瓦尔巴', features: '北极熊、极地冰川和极昼极夜' },
  CN: { adjective: '中国', features: '青藏高原、雪山和藏传佛教文化' },
  PE: { adjective: '秘鲁', features: '印加遗迹、安第斯山脉和亚马逊雨林' },
  TZ: { adjective: '坦桑尼亚', features: '乞力马扎罗、塞伦盖蒂和非洲野生动物' },
  FO: { adjective: '法罗群岛', features: '北大西洋风光、悬崖和海鸟' },
  AL: { adjective: '阿尔巴尼亚', features: '巴尔干山脉、古城堡和原始自然' },
};

// 路线类型描述
const ROUTE_TYPE_DESCRIPTIONS: Record<string, string> = {
  'self-drive': '自驾探索',
  'trekking': '徒步穿越',
  'hiking': '徒步探险',
  'mountaineering': '高山攀登',
  'expedition': '探险远征',
  'cruise': '巡游观光',
  'cultural': '文化体验',
};

function generateDescription(
  nameCN: string,
  nameEN: string | null,
  countryCode: string,
  tags: string[]
): string {
  const countryInfo = COUNTRY_DESCRIPTIONS[countryCode] || { 
    adjective: countryCode, 
    features: '独特的自然风光和文化体验' 
  };
  
  // 识别路线类型
  let routeType = '探索之旅';
  for (const [key, desc] of Object.entries(ROUTE_TYPE_DESCRIPTIONS)) {
    if (tags.some(t => t.toLowerCase().includes(key)) || 
        nameCN.includes(key) || 
        (nameEN && nameEN.toLowerCase().includes(key))) {
      routeType = desc;
      break;
    }
  }
  
  // 生成描述
  const description = `${nameCN}是${countryInfo.adjective}的经典${routeType}路线，沿途体验${countryInfo.features}。这条路线适合热爱自然和冒险的旅行者，将带您领略当地最精华的风景和文化。`;
  
  return description;
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║            补充 RouteDirection 描述数据                       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  if (isDryRun) {
    console.log('🔍 运行模式: 仅检查\n');
  }
  
  // 获取缺失描述的路线
  const routes = await prisma.$queryRaw<any[]>`
    SELECT id, "nameCN", "nameEN", "countryCode", tags
    FROM "RouteDirection"
    WHERE description IS NULL OR description = ''
  `;
  
  console.log(`📋 缺失描述的路线: ${routes.length} 条\n`);
  
  if (routes.length === 0) {
    console.log('✅ 所有路线都有描述，无需更新\n');
    return;
  }
  
  let updatedCount = 0;
  
  for (const route of routes) {
    const tags = route.tags || [];
    const description = generateDescription(
      route.nameCN,
      route.nameEN,
      route.countryCode,
      tags
    );
    
    console.log(`  ${route.nameCN}:`);
    console.log(`    生成描述: ${description.substring(0, 60)}...\n`);
    
    if (!isDryRun) {
      await prisma.$executeRaw`
        UPDATE "RouteDirection"
        SET description = ${description},
            "updatedAt" = NOW()
        WHERE id = ${route.id}
      `;
      updatedCount++;
    }
  }
  
  console.log(`📊 更新结果:`);
  console.log(`   处理路线: ${routes.length}`);
  console.log(`   成功更新: ${updatedCount}`);
  
  // 验证
  if (!isDryRun) {
    const verifyStats = await prisma.$queryRaw<any[]>`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN description IS NOT NULL AND description != '' THEN 1 END) as with_desc
      FROM "RouteDirection"
    `;
    console.log(`\n📈 最终统计:`);
    console.log(`   总路线: ${verifyStats[0].total}`);
    console.log(`   有描述: ${verifyStats[0].with_desc} (${((Number(verifyStats[0].with_desc) / Number(verifyStats[0].total)) * 100).toFixed(1)}%)`);
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
