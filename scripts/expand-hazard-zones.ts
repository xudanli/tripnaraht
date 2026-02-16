/**
 * 扩展 hazard_zones 风险区域数据
 * 
 * 功能：
 * 1. 为主要旅行目的地添加常见风险区域
 * 2. 补充缺失的风险类型
 * 
 * 使用方法：
 *   npx ts-node scripts/expand-hazard-zones.ts
 *   npx ts-node scripts/expand-hazard-zones.ts --dry-run
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 风险区域数据定义
interface HazardZone {
  zone_id: string;
  country_code: string;
  type: string;
  level: 'low' | 'medium' | 'high' | 'extreme';
  description: string;
  seasonality?: { months: number[]; notes: string };
  metadata?: Record<string, any>;
}

const HAZARD_ZONES: HazardZone[] = [
  // === 冰岛 Iceland (IS) - 补充 ===
  {
    zone_id: 'IS_WEATHER_SUDDEN_CHANGE',
    country_code: 'IS',
    type: 'weather',
    level: 'high',
    description: '冰岛天气变化极快，可在数小时内从晴天变为暴风雪。尤其在高地地区，必须时刻关注天气预报。',
    seasonality: { months: [1, 2, 3, 10, 11, 12], notes: '冬季风险最高' },
  },
  {
    zone_id: 'IS_ROAD_F_ROADS',
    country_code: 'IS',
    type: 'terrain',
    level: 'high',
    description: 'F道路（高地道路）仅允许4x4车辆通行，河流穿越危险，无救援服务。',
    seasonality: { months: [6, 7, 8, 9], notes: '仅夏季开放' },
  },
  {
    zone_id: 'IS_GEOTHERMAL_BURNS',
    country_code: 'IS',
    type: 'terrain',
    level: 'medium',
    description: '地热区域地面温度极高，可能导致严重烫伤。切勿离开标记的步道。',
  },
  {
    zone_id: 'IS_GLACIER_CREVASSE',
    country_code: 'IS',
    type: 'terrain',
    level: 'extreme',
    description: '冰川存在隐蔽的裂缝，未经专业指导的冰川行走极度危险。必须跟随持证向导并使用适当装备。',
    seasonality: { months: [1, 2, 3, 4, 5, 10, 11, 12], notes: '冬春季裂缝可能被雪覆盖' },
  },
  {
    zone_id: 'IS_ROGUE_WAVE',
    country_code: 'IS',
    type: 'terrain',
    level: 'high',
    description: '黑沙滩（如 Reynisfjara）常有危险的涌浪。突发的大浪可将人卷入海中，每年都有游客遇难。',
  },

  // === 挪威 Norway (NO) - 补充 ===
  {
    zone_id: 'NO_AVALANCHE_LOFOTEN',
    country_code: 'NO',
    type: 'AVALANCHE',
    level: 'high',
    description: '罗弗敦群岛冬季滑雪和徒步存在雪崩风险。查看 varsom.no 获取每日雪崩预警。',
    seasonality: { months: [1, 2, 3, 4, 11, 12], notes: '冬季积雪期间' },
  },
  {
    zone_id: 'NO_POLAR_BEAR_SVALBARD',
    country_code: 'NO',
    type: 'wildlife',
    level: 'extreme',
    description: '斯瓦尔巴群岛有北极熊出没。离开定居点必须携带武器和信号弹。',
    metadata: { region: 'Svalbard', required_equipment: ['rifle', 'flare_gun'] },
  },
  {
    zone_id: 'NO_MIDNIGHT_SUN_DISORIENTATION',
    country_code: 'NO',
    type: 'health',
    level: 'low',
    description: '极昼期间可能导致睡眠紊乱和方向感丧失。建议使用遮光窗帘和定时作息。',
    seasonality: { months: [5, 6, 7], notes: '北极圈以北地区' },
  },
  {
    zone_id: 'NO_TROLL_TONGUE_OVERCROWDING',
    country_code: 'NO',
    type: 'crowd',
    level: 'medium',
    description: '巨魔之舌(Trolltunga)夏季人满为患，需排队数小时。建议预订帐篷位或选择淡季。',
    seasonality: { months: [6, 7, 8], notes: '夏季高峰期' },
  },

  // === 新西兰 New Zealand (NZ) ===
  {
    zone_id: 'NZ_SANDFLY',
    country_code: 'NZ',
    type: 'wildlife',
    level: 'medium',
    description: '沙蝇（Sandfly）在南岛西海岸极为常见，叮咬后剧痒持续数周。携带高效驱虫剂。',
    metadata: { region: 'South Island West Coast' },
  },
  {
    zone_id: 'NZ_MILFORD_AVALANCHE',
    country_code: 'NZ',
    type: 'AVALANCHE',
    level: 'high',
    description: '米尔福德峡湾公路冬季可能因雪崩关闭。出发前检查 NZTA 道路状态。',
    seasonality: { months: [5, 6, 7, 8], notes: '冬季' },
  },
  {
    zone_id: 'NZ_TRAMPING_WEATHER',
    country_code: 'NZ',
    type: 'weather',
    level: 'high',
    description: '新西兰山区天气变化极快。即使夏季也需准备保暖防水装备。假设体温过低风险。',
  },
  {
    zone_id: 'NZ_RIVER_CROSSING',
    country_code: 'NZ',
    type: 'terrain',
    level: 'high',
    description: '许多徒步路线需要渡河。暴雨后河流水位可在数小时内暴涨。切勿在洪水期间尝试渡河。',
  },
  {
    zone_id: 'NZ_VOLCANIC_TONGARIRO',
    country_code: 'NZ',
    type: 'VOLCANIC',
    level: 'medium',
    description: '汤加里罗山为活火山。检查 GeoNet 火山警报级别。携带口罩以防火山灰。',
    metadata: { volcano: 'Tongariro', monitor: 'geonet.org.nz' },
  },

  // === 格陵兰 Greenland (GL) ===
  {
    zone_id: 'GL_POLAR_BEAR',
    country_code: 'GL',
    type: 'wildlife',
    level: 'extreme',
    description: '北极熊分布在东部和北部地区。野外露营必须携带武器和使用围栏警报系统。',
    metadata: { regions: ['East Greenland', 'North Greenland'] },
  },
  {
    zone_id: 'GL_ICE_CALVING',
    country_code: 'GL',
    type: 'terrain',
    level: 'high',
    description: '冰川崩解会产生巨浪。在冰山和冰川前保持至少200米安全距离。',
    metadata: { safe_distance_m: 200 },
  },
  {
    zone_id: 'GL_ISOLATION',
    country_code: 'GL',
    type: 'ACCESSIBILITY',
    level: 'high',
    description: '格陵兰几乎没有道路连接城镇，救援响应时间可能需要数天。确保有卫星通讯设备。',
    metadata: { recommended: ['satellite_phone', 'PLB'] },
  },
  {
    zone_id: 'GL_MOSQUITO_SUMMER',
    country_code: 'GL',
    type: 'wildlife',
    level: 'medium',
    description: '夏季蚊虫密度极高。必须携带防蚊头网和强效驱虫剂。',
    seasonality: { months: [6, 7, 8], notes: '夏季' },
  },

  // === 阿根廷 Argentina (AR) - 补充 ===
  {
    zone_id: 'AR_PATAGONIA_WIND',
    country_code: 'AR',
    type: 'weather',
    level: 'high',
    description: '巴塔哥尼亚风力极强，常超过100km/h。帐篷必须牢固固定，徒步时注意平衡。',
    seasonality: { months: [10, 11, 12, 1, 2, 3], notes: '夏季风力最强' },
  },
  {
    zone_id: 'AR_PERITO_MORENO_CALVING',
    country_code: 'AR',
    type: 'terrain',
    level: 'medium',
    description: '莫雷诺冰川崩解频繁。在观景台安全区域观看，勿试图靠近冰川边缘。',
  },
  {
    zone_id: 'AR_ALTITUDE_ACONCAGUA',
    country_code: 'AR',
    type: 'ALTITUDE_RISKS',
    level: 'extreme',
    description: '阿空加瓜峰(6961m)需要充分适应高原。高山病致死率较高。必须有适应计划和医疗保险。',
    metadata: { peak: 'Aconcagua', elevation_m: 6961 },
  },
  {
    zone_id: 'AR_USHUAIA_HYPOTHERMIA',
    country_code: 'AR',
    type: 'weather',
    level: 'high',
    description: '乌斯怀亚即使夏季也可能出现低温。始终携带保暖层和防风服装。',
  },

  // === 意大利 Italy (IT) - 多洛米蒂 ===
  {
    zone_id: 'IT_DOLOMITES_VIA_FERRATA',
    country_code: 'IT',
    type: 'terrain',
    level: 'high',
    description: '铁道攀登(Via Ferrata)需要专业装备和技术。雷暴时金属梯道极度危险。',
    seasonality: { months: [6, 7, 8, 9], notes: '夏季开放' },
  },
  {
    zone_id: 'IT_DOLOMITES_ROCKFALL',
    country_code: 'IT',
    type: 'terrain',
    level: 'medium',
    description: '多洛米蒂白云石山体脆弱，落石风险较高。戴好头盔，避免在悬崖下逗留。',
  },
  {
    zone_id: 'IT_DOLOMITES_THUNDERSTORM',
    country_code: 'IT',
    type: 'weather',
    level: 'high',
    description: '夏季午后雷暴频繁。建议早出发，中午前下山或到达小屋。',
    seasonality: { months: [6, 7, 8], notes: '夏季午后' },
  },

  // === 尼泊尔 Nepal (NP) - 补充 ===
  {
    zone_id: 'NP_AMS_EBC',
    country_code: 'NP',
    type: 'ALTITUDE_RISKS',
    level: 'extreme',
    description: '珠峰大本营海拔5364m。必须遵循适应计划，出现症状立即下撤。Diamox可作为预防。',
    metadata: { elevation_m: 5364, recommended_acclimatization_days: 3 },
  },
  {
    zone_id: 'NP_MONSOON_LANDSLIDE',
    country_code: 'NP',
    type: 'terrain',
    level: 'high',
    description: '季风季节（6-9月）山体滑坡频繁，道路可能中断。建议避开此期间徒步。',
    seasonality: { months: [6, 7, 8, 9], notes: '季风季节' },
  },
  {
    zone_id: 'NP_LEECH_SEASON',
    country_code: 'NP',
    type: 'wildlife',
    level: 'low',
    description: '雨季低海拔地区蚂蝗常见。穿长袜、使用盐或驱蚂蝗喷雾。',
    seasonality: { months: [5, 6, 7, 8, 9, 10], notes: '雨季' },
  },

  // === 秘鲁 Peru (PE) ===
  {
    zone_id: 'PE_ALTITUDE_CUSCO',
    country_code: 'PE',
    type: 'ALTITUDE_RISKS',
    level: 'high',
    description: '库斯科海拔3400m。抵达后前两天需休息适应。多喝水、避免酒精。',
    metadata: { elevation_m: 3400 },
  },
  {
    zone_id: 'PE_INCA_TRAIL_PERMIT',
    country_code: 'PE',
    type: 'ACCESSIBILITY',
    level: 'medium',
    description: '印加古道每天限500人（含向导和搬运工）。需提前数月预订许可证。',
    metadata: { daily_limit: 500, booking_advance_months: 6 },
  },
  {
    zone_id: 'PE_AMAZON_WILDLIFE',
    country_code: 'PE',
    type: 'wildlife',
    level: 'medium',
    description: '亚马逊雨林有毒蛇、蜘蛛和蚊虫。穿高筒靴、使用蚊帐、接种黄热病疫苗。',
    metadata: { vaccinations: ['yellow_fever'] },
  },

  // === 坦桑尼亚 Tanzania (TZ) ===
  {
    zone_id: 'TZ_KILIMANJARO_AMS',
    country_code: 'TZ',
    type: 'ALTITUDE_RISKS',
    level: 'extreme',
    description: '乞力马扎罗山顶5895m。约50%登山者经历高山反应。选择较长路线以适应。',
    metadata: { elevation_m: 5895, ams_rate: 0.5 },
  },
  {
    zone_id: 'TZ_SAFARI_WILDLIFE',
    country_code: 'TZ',
    type: 'wildlife',
    level: 'high',
    description: '塞伦盖蒂野生动物有攻击性。严格待在车内，勿尝试接近动物。',
  },
  {
    zone_id: 'TZ_MALARIA',
    country_code: 'TZ',
    type: 'health',
    level: 'high',
    description: '疟疾在坦桑尼亚广泛存在。服用预防药物，使用蚊帐和驱蚊剂。',
    metadata: { prophylaxis: ['malarone', 'doxycycline'] },
  },
];

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║              扩展 hazard_zones 风险区域数据                   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  if (isDryRun) {
    console.log('🔍 运行模式: 仅检查\n');
  }
  
  // 检查现有记录
  const existing = await prisma.$queryRaw<any[]>`SELECT zone_id FROM hazard_zones`;
  const existingIds = new Set(existing.map((e: any) => e.zone_id));
  
  console.log(`📊 现有 hazard_zones 记录: ${existingIds.size} 条`);
  console.log(`📋 待导入数据: ${HAZARD_ZONES.length} 条\n`);
  
  const toInsert = HAZARD_ZONES.filter(h => !existingIds.has(h.zone_id));
  console.log(`🆕 新增记录: ${toInsert.length} 条\n`);
  
  if (toInsert.length === 0) {
    console.log('✅ 所有数据已存在，无需更新\n');
    return;
  }
  
  // 按国家统计
  const byCountry: Record<string, number> = {};
  toInsert.forEach(h => {
    byCountry[h.country_code] = (byCountry[h.country_code] || 0) + 1;
  });
  
  console.log('按国家分布:');
  Object.entries(byCountry).sort((a, b) => b[1] - a[1]).forEach(([c, n]) => {
    console.log(`  ${c}: ${n} 条`);
  });
  console.log();
  
  if (!isDryRun) {
    console.log('📥 导入数据...\n');
    
    let inserted = 0;
    for (const zone of toInsert) {
      const seasonality = zone.seasonality ? JSON.stringify(zone.seasonality) : null;
      const metadata = zone.metadata ? JSON.stringify(zone.metadata) : null;
      
      await prisma.$executeRaw`
        INSERT INTO hazard_zones (
          id, zone_id, country_code, type, level, 
          description, seasonality, metadata,
          created_at, updated_at
        ) VALUES (
          gen_random_uuid(),
          ${zone.zone_id},
          ${zone.country_code},
          ${zone.type},
          ${zone.level},
          ${zone.description},
          ${seasonality}::jsonb,
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
    SELECT country_code, COUNT(*) as count
    FROM hazard_zones
    GROUP BY country_code
    ORDER BY count DESC
  `;
  
  console.log('📈 最终国家分布:');
  finalStats.forEach((s: any) => console.log(`   ${s.country_code}: ${s.count} 条`));
  
  const typeStats = await prisma.$queryRaw<any[]>`
    SELECT type, COUNT(*) as count
    FROM hazard_zones
    GROUP BY type
    ORDER BY count DESC
  `;
  
  console.log('\n📈 最终类型分布:');
  typeStats.forEach((s: any) => console.log(`   ${s.type}: ${s.count} 条`));
  
  console.log('\n✅ 脚本执行完成\n');
}

main()
  .catch((e) => {
    console.error('❌ 执行失败:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

export {};
