/**
 * 导入 Trail 徒步线路数据
 * 
 * 功能：
 * 1. 从知识库的路线数据中提取徒步线路
 * 2. 创建标准化的 Trail 记录
 * 
 * 使用方法：
 *   npx ts-node scripts/import-trails.ts
 *   npx ts-node scripts/import-trails.ts --dry-run
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 预定义的徒步线路数据
interface TrailData {
  nameCN: string;
  nameEN: string;
  description: string;
  distanceKm: number;
  elevationGainM: number;
  elevationLossM?: number;
  maxElevationM?: number;
  minElevationM?: number;
  difficultyLevel: 'EASY' | 'MODERATE' | 'CHALLENGING' | 'HARD' | 'EXTREME';
  estimatedDurationHours: number;
  source: string;
  sourceUrl?: string;
  metadata?: Record<string, any>;
}

const TRAILS: TrailData[] = [
  // === 冰岛 Iceland ===
  {
    nameCN: '菲姆沃杜豪尔斯步道',
    nameEN: 'Fimmvörðuháls Trail',
    description: '连接斯科加瀑布和索斯莫克的标志性高山徒步路线，穿越冰川和火山地貌',
    distanceKm: 25,
    elevationGainM: 1000,
    maxElevationM: 1116,
    difficultyLevel: 'HARD',
    estimatedDurationHours: 10,
    source: 'official',
    metadata: { country: 'IS', region: 'South Iceland', season: 'June-September' },
  },
  {
    nameCN: '朗格迈维卢尔徒步路线',
    nameEN: 'Laugavegur Trail',
    description: '冰岛最著名的多日徒步路线，从兰德曼纳劳卡到索斯莫克',
    distanceKm: 55,
    elevationGainM: 1600,
    elevationLossM: 2000,
    maxElevationM: 1050,
    difficultyLevel: 'CHALLENGING',
    estimatedDurationHours: 20,
    source: 'official',
    metadata: { country: 'IS', region: 'Highlands', season: 'July-August', days: 4 },
  },
  {
    nameCN: '格里姆尔瀑布徒步',
    nameEN: 'Glymur Waterfall Hike',
    description: '冰岛第二高瀑布的徒步路线，需要渡河',
    distanceKm: 7,
    elevationGainM: 400,
    maxElevationM: 200,
    difficultyLevel: 'MODERATE',
    estimatedDurationHours: 4,
    source: 'official',
    metadata: { country: 'IS', region: 'West Iceland' },
  },
  
  // === 挪威 Norway ===
  {
    nameCN: '巨魔之舌徒步',
    nameEN: 'Trolltunga Hike',
    description: '挪威最著名的徒步路线，终点是悬崖上的岩石舌头',
    distanceKm: 28,
    elevationGainM: 800,
    maxElevationM: 1180,
    minElevationM: 350,
    difficultyLevel: 'HARD',
    estimatedDurationHours: 12,
    source: 'official',
    metadata: { country: 'NO', region: 'Hordaland', season: 'June-September' },
  },
  {
    nameCN: '奇迹岩徒步',
    nameEN: 'Kjeragbolten Hike',
    description: '通往悬崖间著名大圆石的徒步路线',
    distanceKm: 10,
    elevationGainM: 570,
    maxElevationM: 1020,
    difficultyLevel: 'CHALLENGING',
    estimatedDurationHours: 6,
    source: 'official',
    metadata: { country: 'NO', region: 'Rogaland' },
  },
  {
    nameCN: '布道石徒步',
    nameEN: 'Preikestolen (Pulpit Rock) Hike',
    description: '通往挪威最著名观景点的徒步路线',
    distanceKm: 8,
    elevationGainM: 350,
    maxElevationM: 604,
    difficultyLevel: 'MODERATE',
    estimatedDurationHours: 4,
    source: 'official',
    metadata: { country: 'NO', region: 'Rogaland' },
  },
  {
    nameCN: '罗弗敦群岛雷尼布林根峰',
    nameEN: 'Reinebringen Peak',
    description: '罗弗敦群岛最著名的景观徒步，俯瞰雷讷渔村',
    distanceKm: 3.2,
    elevationGainM: 450,
    maxElevationM: 448,
    difficultyLevel: 'CHALLENGING',
    estimatedDurationHours: 3,
    source: 'official',
    metadata: { country: 'NO', region: 'Lofoten' },
  },
  
  // === 新西兰 New Zealand ===
  {
    nameCN: '米尔福德步道',
    nameEN: 'Milford Track',
    description: '新西兰最著名的大步道，被誉为世界上最美的徒步路线',
    distanceKm: 53.5,
    elevationGainM: 1440,
    maxElevationM: 1154,
    difficultyLevel: 'CHALLENGING',
    estimatedDurationHours: 32,
    source: 'DOC',
    sourceUrl: 'https://www.doc.govt.nz/milfordtrack',
    metadata: { country: 'NZ', region: 'Fiordland', days: 4, booking_required: true },
  },
  {
    nameCN: '路特本步道',
    nameEN: 'Routeburn Track',
    description: '穿越山毛榉森林和高山草甸的著名大步道',
    distanceKm: 32,
    elevationGainM: 1300,
    maxElevationM: 1255,
    difficultyLevel: 'CHALLENGING',
    estimatedDurationHours: 18,
    source: 'DOC',
    metadata: { country: 'NZ', region: 'Fiordland/Mount Aspiring', days: 3 },
  },
  {
    nameCN: '汤加里罗高山穿越',
    nameEN: 'Tongariro Alpine Crossing',
    description: '新西兰最受欢迎的一日徒步，穿越活火山地貌',
    distanceKm: 19.4,
    elevationGainM: 765,
    maxElevationM: 1886,
    difficultyLevel: 'CHALLENGING',
    estimatedDurationHours: 8,
    source: 'DOC',
    metadata: { country: 'NZ', region: 'Tongariro', volcanic: true },
  },
  {
    nameCN: '库克山胡克山谷步道',
    nameEN: 'Hooker Valley Track',
    description: '通往库克山冰川湖的轻松步道',
    distanceKm: 10,
    elevationGainM: 100,
    maxElevationM: 800,
    difficultyLevel: 'EASY',
    estimatedDurationHours: 3,
    source: 'DOC',
    metadata: { country: 'NZ', region: 'Mount Cook' },
  },
  
  // === 尼泊尔 Nepal ===
  {
    nameCN: '珠峰大本营徒步',
    nameEN: 'Everest Base Camp Trek',
    description: '世界上最著名的高山徒步路线，前往珠穆朗玛峰大本营',
    distanceKm: 130,
    elevationGainM: 6200,
    maxElevationM: 5364,
    minElevationM: 2800,
    difficultyLevel: 'EXTREME',
    estimatedDurationHours: 96,
    source: 'official',
    metadata: { country: 'NP', region: 'Khumbu', days: 14, permit_required: true },
  },
  {
    nameCN: '安纳普尔纳大环线',
    nameEN: 'Annapurna Circuit Trek',
    description: '尼泊尔最经典的长途徒步路线，环绕安纳普尔纳山群',
    distanceKm: 230,
    elevationGainM: 9000,
    maxElevationM: 5416,
    difficultyLevel: 'EXTREME',
    estimatedDurationHours: 160,
    source: 'official',
    metadata: { country: 'NP', region: 'Annapurna', days: 18, pass: 'Thorong La' },
  },
  {
    nameCN: '安纳普尔纳大本营徒步',
    nameEN: 'Annapurna Base Camp Trek',
    description: '前往安纳普尔纳大本营的经典徒步路线',
    distanceKm: 115,
    elevationGainM: 4500,
    maxElevationM: 4130,
    difficultyLevel: 'HARD',
    estimatedDurationHours: 56,
    source: 'official',
    metadata: { country: 'NP', region: 'Annapurna', days: 10 },
  },
  {
    nameCN: '蓝塘山谷徒步',
    nameEN: 'Langtang Valley Trek',
    description: '距加德满都最近的喜马拉雅徒步路线',
    distanceKm: 60,
    elevationGainM: 3000,
    maxElevationM: 4984,
    difficultyLevel: 'CHALLENGING',
    estimatedDurationHours: 40,
    source: 'official',
    metadata: { country: 'NP', region: 'Langtang', days: 7 },
  },
  
  // === 瑞士 Switzerland ===
  {
    nameCN: '环勃朗峰徒步',
    nameEN: 'Tour du Mont Blanc',
    description: '穿越法国、意大利和瑞士的著名环线徒步',
    distanceKm: 170,
    elevationGainM: 10000,
    maxElevationM: 2665,
    difficultyLevel: 'HARD',
    estimatedDurationHours: 100,
    source: 'official',
    metadata: { countries: ['FR', 'IT', 'CH'], days: 11 },
  },
  {
    nameCN: '沃克高地徒步',
    nameEN: 'Haute Route (Walker\'s)',
    description: '从夏蒙尼到采尔马特的经典高山徒步路线',
    distanceKm: 180,
    elevationGainM: 12000,
    maxElevationM: 2987,
    difficultyLevel: 'EXTREME',
    estimatedDurationHours: 120,
    source: 'official',
    metadata: { countries: ['FR', 'CH'], days: 14 },
  },
  {
    nameCN: '艾格峰北壁观景步道',
    nameEN: 'Eiger Trail',
    description: '沿艾格峰北壁下方的壮观步道',
    distanceKm: 6,
    elevationGainM: 200,
    elevationLossM: 700,
    maxElevationM: 2320,
    difficultyLevel: 'MODERATE',
    estimatedDurationHours: 3,
    source: 'official',
    metadata: { country: 'CH', region: 'Grindelwald' },
  },
  {
    nameCN: '格林德瓦尔德先行者步道',
    nameEN: 'Grindelwald First Cliff Walk',
    description: '格林德瓦尔德山顶的悬崖步道和吊桥',
    distanceKm: 3,
    elevationGainM: 100,
    maxElevationM: 2168,
    difficultyLevel: 'EASY',
    estimatedDurationHours: 1.5,
    source: 'official',
    metadata: { country: 'CH', region: 'Grindelwald' },
  },
  
  // === 意大利 Italy (多洛米蒂) ===
  {
    nameCN: '多洛米蒂高地步道1号',
    nameEN: 'Alta Via 1 (Dolomites)',
    description: '多洛米蒂山脉最著名的长途徒步路线',
    distanceKm: 120,
    elevationGainM: 6800,
    maxElevationM: 2752,
    difficultyLevel: 'HARD',
    estimatedDurationHours: 70,
    source: 'official',
    metadata: { country: 'IT', region: 'Dolomites', days: 10 },
  },
  {
    nameCN: '三峰环线',
    nameEN: 'Tre Cime di Lavaredo Circuit',
    description: '环绕多洛米蒂标志性三峰的经典徒步路线',
    distanceKm: 10,
    elevationGainM: 400,
    maxElevationM: 2454,
    difficultyLevel: 'MODERATE',
    estimatedDurationHours: 4,
    source: 'official',
    metadata: { country: 'IT', region: 'Dolomites' },
  },
  
  // === 阿根廷 Argentina ===
  {
    nameCN: '菲茨罗伊峰徒步',
    nameEN: 'Mount Fitz Roy Trek',
    description: '前往巴塔哥尼亚标志性山峰的著名徒步路线',
    distanceKm: 25,
    elevationGainM: 750,
    maxElevationM: 1200,
    difficultyLevel: 'CHALLENGING',
    estimatedDurationHours: 10,
    source: 'official',
    metadata: { country: 'AR', region: 'El Chaltén' },
  },
  {
    nameCN: '托雷峰徒步',
    nameEN: 'Cerro Torre Trek',
    description: '前往巴塔哥尼亚著名技术型山峰的徒步路线',
    distanceKm: 22,
    elevationGainM: 400,
    maxElevationM: 600,
    difficultyLevel: 'MODERATE',
    estimatedDurationHours: 8,
    source: 'official',
    metadata: { country: 'AR', region: 'El Chaltén' },
  },
  {
    nameCN: '莫雷诺冰川徒步',
    nameEN: 'Perito Moreno Glacier Trek',
    description: '在巴塔哥尼亚著名冰川上的冰上徒步体验',
    distanceKm: 3,
    elevationGainM: 100,
    maxElevationM: 200,
    difficultyLevel: 'MODERATE',
    estimatedDurationHours: 4,
    source: 'official',
    metadata: { country: 'AR', region: 'El Calafate', glacier_trek: true },
  },
  
  // === 格陵兰 Greenland ===
  {
    nameCN: '伊卢利萨特冰峡湾步道',
    nameEN: 'Ilulissat Icefjord Trail',
    description: '世界遗产冰峡湾的观景徒步路线',
    distanceKm: 7,
    elevationGainM: 150,
    maxElevationM: 200,
    difficultyLevel: 'EASY',
    estimatedDurationHours: 3,
    source: 'official',
    metadata: { country: 'GL', region: 'Ilulissat', unesco: true },
  },
  
  // === 秘鲁 Peru ===
  {
    nameCN: '印加古道',
    nameEN: 'Inca Trail to Machu Picchu',
    description: '世界上最著名的考古徒步路线，前往马丘比丘',
    distanceKm: 43,
    elevationGainM: 2400,
    maxElevationM: 4215,
    difficultyLevel: 'HARD',
    estimatedDurationHours: 28,
    source: 'official',
    metadata: { country: 'PE', region: 'Cusco', days: 4, permit_required: true },
  },
  {
    nameCN: '萨尔坎泰徒步',
    nameEN: 'Salkantay Trek',
    description: '印加古道的替代路线，风景更为壮观',
    distanceKm: 74,
    elevationGainM: 3500,
    maxElevationM: 4630,
    difficultyLevel: 'HARD',
    estimatedDurationHours: 40,
    source: 'official',
    metadata: { country: 'PE', region: 'Cusco', days: 5 },
  },
  
  // === 坦桑尼亚 Tanzania ===
  {
    nameCN: '乞力马扎罗马兰古路线',
    nameEN: 'Kilimanjaro Marangu Route',
    description: '乞力马扎罗最受欢迎的登顶路线，唯一有小屋住宿的路线',
    distanceKm: 64,
    elevationGainM: 4000,
    maxElevationM: 5895,
    minElevationM: 1879,
    difficultyLevel: 'EXTREME',
    estimatedDurationHours: 48,
    source: 'official',
    metadata: { country: 'TZ', region: 'Kilimanjaro', days: 6, hut_accommodation: true },
  },
  {
    nameCN: '乞力马扎罗马切姆路线',
    nameEN: 'Kilimanjaro Machame Route',
    description: '乞力马扎罗最受欢迎的登顶路线，风景最佳',
    distanceKm: 62,
    elevationGainM: 4000,
    maxElevationM: 5895,
    difficultyLevel: 'EXTREME',
    estimatedDurationHours: 56,
    source: 'official',
    metadata: { country: 'TZ', region: 'Kilimanjaro', days: 7, camping: true },
  },
];

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║              导入 Trail 徒步线路数据                          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  if (isDryRun) {
    console.log('🔍 运行模式: 仅检查\n');
  }
  
  // 检查现有记录
  const existing = await prisma.$queryRaw<any[]>`SELECT "nameEN" FROM "Trail"`;
  const existingNames = new Set(existing.map((e: any) => e.nameEN));
  
  console.log(`📊 现有 Trail 记录: ${existingNames.size} 条`);
  console.log(`📋 待导入数据: ${TRAILS.length} 条\n`);
  
  const toInsert = TRAILS.filter(t => !existingNames.has(t.nameEN));
  console.log(`🆕 新增记录: ${toInsert.length} 条\n`);
  
  if (toInsert.length === 0) {
    console.log('✅ 所有数据已存在，无需更新\n');
    return;
  }
  
  // 按难度统计
  const byDifficulty: Record<string, number> = {};
  toInsert.forEach(t => {
    byDifficulty[t.difficultyLevel] = (byDifficulty[t.difficultyLevel] || 0) + 1;
  });
  
  console.log('按难度分布:');
  Object.entries(byDifficulty).forEach(([d, n]) => console.log(`  ${d}: ${n} 条`));
  console.log();
  
  if (!isDryRun) {
    console.log('📥 导入数据...\n');
    
    let inserted = 0;
    for (const trail of toInsert) {
      const uuid = `trail_${trail.nameEN.toLowerCase().replace(/[^a-z0-9]+/g, '_').substring(0, 50)}`;
      const metadata = trail.metadata ? JSON.stringify(trail.metadata) : null;
      
      await prisma.$executeRaw`
        INSERT INTO "Trail" (
          uuid, "nameCN", "nameEN", description,
          "distanceKm", "elevationGainM", "elevationLossM",
          "maxElevationM", "minElevationM",
          "difficultyLevel", "estimatedDurationHours",
          source, "sourceUrl", metadata,
          "createdAt", "updatedAt"
        ) VALUES (
          ${uuid},
          ${trail.nameCN},
          ${trail.nameEN},
          ${trail.description},
          ${trail.distanceKm},
          ${trail.elevationGainM},
          ${trail.elevationLossM || null},
          ${trail.maxElevationM || null},
          ${trail.minElevationM || null},
          ${trail.difficultyLevel},
          ${trail.estimatedDurationHours},
          ${trail.source},
          ${trail.sourceUrl || null},
          ${metadata}::jsonb,
          NOW(),
          NOW()
        )
      `;
      inserted++;
      process.stdout.write(`\r   已导入: ${inserted}/${toInsert.length}`);
    }
    
    console.log('\n');
  }
  
  // 最终统计
  const finalStats = await prisma.$queryRaw<any[]>`
    SELECT "difficultyLevel", COUNT(*) as count
    FROM "Trail"
    GROUP BY "difficultyLevel"
    ORDER BY 
      CASE "difficultyLevel"
        WHEN 'EASY' THEN 1
        WHEN 'MODERATE' THEN 2
        WHEN 'CHALLENGING' THEN 3
        WHEN 'HARD' THEN 4
        WHEN 'EXTREME' THEN 5
      END
  `;
  
  console.log('📈 最终难度分布:');
  finalStats.forEach((s: any) => console.log(`   ${s.difficultyLevel}: ${s.count} 条`));
  
  // 按国家统计
  const countryStats = await prisma.$queryRaw<any[]>`
    SELECT metadata->>'country' as country, COUNT(*) as count
    FROM "Trail"
    WHERE metadata->>'country' IS NOT NULL
    GROUP BY metadata->>'country'
    ORDER BY count DESC
  `;
  
  console.log('\n📈 按国家分布:');
  countryStats.forEach((s: any) => console.log(`   ${s.country}: ${s.count} 条`));
  
  const totalCount = await prisma.$queryRaw<any[]>`SELECT COUNT(*) as c FROM "Trail"`;
  console.log(`\n📊 Trail 总数: ${totalCount[0].c} 条`);
  
  console.log('\n✅ 脚本执行完成\n');
}

main()
  .catch((e) => {
    console.error('❌ 执行失败:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

export {};
