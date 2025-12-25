// scripts/seed-route-directions.ts
/**
 * 路线方向示例数据种子脚本
 * 包含新西兰、尼泊尔、西藏的路线方向示例
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('开始创建路线方向示例数据...');

  // ========== 新西兰 (NZ) ==========

  // 1. 南岛湖区+山口+徒步方向
  const nzSouthIslandLakes = await prisma.routeDirection.create({
    data: {
      countryCode: 'NZ',
      name: 'NZ_SOUTH_ISLAND_LAKES_AND_PASSES',
      nameCN: '南岛湖区+山口+徒步',
      nameEN: 'South Island Lakes and Passes',
      description: '经典的新西兰南岛湖区路线，涵盖皇后镇、瓦纳卡、蒂卡普湖和库克山，适合徒步和摄影爱好者',
      tags: ['徒步', '摄影', '湖区', '山口'],
      regions: ['NZ_QT', 'NZ_WN', 'NZ_TK', 'NZ_MC'],
      entryHubs: ['Queenstown Airport', 'Christchurch Airport'],
      seasonality: {
        bestMonths: [12, 1, 2, 3], // 夏季（南半球）
        avoidMonths: [6, 7, 8], // 冬季
      },
      constraints: {
        maxElevationM: 2000,
        maxDailyAscentM: 800,
        maxSlope: 25,
        requiresPermit: false,
        requiresGuide: false,
        rapidAscentForbidden: false,
      },
      riskProfile: {
        altitudeSickness: false,
        roadClosure: true, // 冬季山口可能封路
        ferryDependent: false,
        weatherWindow: true,
        weatherWindowMonths: [6, 7, 8],
      },
      signaturePois: {
        types: ['VIEWPOINT', 'LAKE', 'MOUNTAIN_PASS', 'TRAIL'],
        examples: [],
      },
      itinerarySkeleton: {
        dayThemes: ['适应日', '湖区游览', '徒步日', '观景日'],
        dailyPace: 'MODERATE',
        restDaysRequired: [],
      },
      isActive: true,
    },
  });

  // 2. 峡湾出海方向
  const nzFiordlandMilford = await prisma.routeDirection.create({
    data: {
      countryCode: 'NZ',
      name: 'NZ_FIORDLAND_MILFORD',
      nameCN: '峡湾出海（米尔福德）',
      nameEN: 'Fiordland Milford Sound',
      description: '从蒂阿瑙到米尔福德峡湾的经典路线，包含峡湾出海和短途徒步',
      tags: ['出海', '峡湾', '摄影', '自然'],
      regions: ['NZ_TA', 'NZ_MS'],
      entryHubs: ['Queenstown Airport', 'Te Anau'],
      seasonality: {
        bestMonths: [12, 1, 2, 3],
        avoidMonths: [6, 7, 8],
      },
      constraints: {
        maxElevationM: 1200,
        maxDailyAscentM: 500,
        maxSlope: 20,
        requiresPermit: false,
        requiresGuide: false,
      },
      riskProfile: {
        altitudeSickness: false,
        roadClosure: true,
        ferryDependent: true, // 依赖渡轮/出海班次
        weatherWindow: true,
        weatherWindowMonths: [6, 7, 8],
      },
      signaturePois: {
        types: ['FJORD', 'CRUISE', 'VIEWPOINT'],
        examples: [],
      },
      itinerarySkeleton: {
        dayThemes: ['前往蒂阿瑙', '峡湾出海', '返程'],
        dailyPace: 'RELAX',
        restDaysRequired: [],
      },
      isActive: true,
  },
  });

  // 3. 北岛火山地热方向
  const nzNorthIslandVolcanic = await prisma.routeDirection.create({
    data: {
      countryCode: 'NZ',
      name: 'NZ_NORTH_ISLAND_VOLCANIC',
      nameCN: '北岛火山地热',
      nameEN: 'North Island Volcanic and Geothermal',
      description: '罗托鲁瓦、陶波、汤加里罗国家公园的火山地热路线，适合短途徒步和地热体验',
      tags: ['火山', '地热', '徒步', '自然'],
      regions: ['NZ_RO', 'NZ_TP', 'NZ_TG'],
      entryHubs: ['Auckland Airport', 'Rotorua'],
      seasonality: {
        bestMonths: [12, 1, 2, 3, 4, 5, 9, 10, 11],
        avoidMonths: [6, 7, 8],
      },
      constraints: {
        maxElevationM: 2800,
        maxDailyAscentM: 600,
        maxSlope: 22,
        requiresPermit: false,
        requiresGuide: false,
      },
      riskProfile: {
        altitudeSickness: false,
        roadClosure: false,
        ferryDependent: false,
        weatherWindow: false,
      },
      signaturePois: {
        types: ['VOLCANO', 'GEOTHERMAL', 'HOT_SPRING', 'TRAIL'],
        examples: [],
      },
      itinerarySkeleton: {
        dayThemes: ['地热体验', '火山徒步', '温泉放松'],
        dailyPace: 'BALANCED',
        restDaysRequired: [],
      },
      isActive: true,
    },
  });

  // ========== 尼泊尔 (NP) ==========

  // 4. EBC 经典徒步线
  const npEbcClassic = await prisma.routeDirection.create({
    data: {
      countryCode: 'NP',
      name: 'NP_EBC_CLASSIC',
      nameCN: 'EBC 经典徒步线',
      nameEN: 'Everest Base Camp Classic Trek',
      description: '从卢卡拉到珠峰大本营的经典徒步路线，途经南池市场、丁波切、戈拉谢普',
      tags: ['徒步', '高海拔', '登山', '极地'],
      regions: ['NP_KTM', 'NP_SOL', 'NP_KH'],
      entryHubs: ['Kathmandu Airport', 'Lukla Airport'],
      seasonality: {
        bestMonths: [10, 11, 12, 3, 4], // 春秋季
        avoidMonths: [6, 7, 8, 9], // 雨季
      },
      constraints: {
        maxElevationM: 5500,
        maxDailyAscentM: 500, // 严格限制每日爬升
        maxSlope: 30,
        requiresPermit: true, // 需要 TIMS 和 Sagarmatha 国家公园许可
        requiresGuide: false, // 不强制但强烈建议
        rapidAscentForbidden: true, // 禁止快速爬升
      },
      riskProfile: {
        altitudeSickness: true, // 高反风险高
        roadClosure: false,
        ferryDependent: false,
        weatherWindow: true,
        weatherWindowMonths: [6, 7, 8, 9],
      },
      signaturePois: {
        types: ['TEAHOUSE_LODGE', 'VIEWPOINT', 'MOUNTAIN_PASS', 'BASE_CAMP'],
        examples: [],
      },
      itinerarySkeleton: {
        dayThemes: ['适应日', '徒步日', '适应日', '徒步日', '观景日', '适应日'],
        dailyPace: 'MODERATE',
        restDaysRequired: [2, 5, 8], // 第2、5、8天必须休息适应
      },
      isActive: true,
    },
  });

  // 5. 安娜普尔纳大本营
  const npAnnapurnaBaseCamp = await prisma.routeDirection.create({
    data: {
      countryCode: 'NP',
      name: 'NP_ANNAPURNA_BASE_CAMP',
      nameCN: '安娜普尔纳大本营',
      nameEN: 'Annapurna Base Camp',
      description: '从博卡拉到安娜普尔纳大本营的徒步路线，途经纳亚普尔、戈雷帕尼',
      tags: ['徒步', '高海拔', '自然'],
      regions: ['NP_PK', 'NP_AN'],
      entryHubs: ['Pokhara', 'Kathmandu Airport'],
      seasonality: {
        bestMonths: [10, 11, 12, 3, 4],
        avoidMonths: [6, 7, 8, 9],
      },
      constraints: {
        maxElevationM: 4100,
        maxDailyAscentM: 600,
        maxSlope: 28,
        requiresPermit: true, // 需要 ACAP 和 TIMS
        requiresGuide: false,
        rapidAscentForbidden: true,
      },
      riskProfile: {
        altitudeSickness: true,
        roadClosure: false,
        ferryDependent: false,
        weatherWindow: true,
        weatherWindowMonths: [6, 7, 8, 9],
      },
      signaturePois: {
        types: ['TEAHOUSE_LODGE', 'VIEWPOINT', 'MOUNTAIN_PASS', 'BASE_CAMP'],
        examples: [],
      },
      itinerarySkeleton: {
        dayThemes: ['适应日', '徒步日', '适应日', '徒步日', '观景日'],
        dailyPace: 'MODERATE',
        restDaysRequired: [2, 5],
      },
      isActive: true,
    },
  });

  // 6. 奇特旺野生动物
  const npChitwanWildlife = await prisma.routeDirection.create({
    data: {
      countryCode: 'NP',
      name: 'NP_CHITWAN_WILDLIFE',
      nameCN: '奇特旺野生动物',
      nameEN: 'Chitwan Wildlife',
      description: '奇特旺国家公园的野生动物观察和丛林活动',
      tags: ['野生动物', '丛林', '自然', '摄影'],
      regions: ['NP_CH'],
      entryHubs: ['Kathmandu Airport', 'Bharatpur Airport'],
      seasonality: {
        bestMonths: [10, 11, 12, 1, 2, 3, 4],
        avoidMonths: [6, 7, 8, 9],
      },
      constraints: {
        maxElevationM: 300,
        maxDailyAscentM: 100,
        maxSlope: 10,
        requiresPermit: true, // 需要国家公园许可
        requiresGuide: true, // 丛林活动需要向导
        rapidAscentForbidden: false,
      },
      riskProfile: {
        altitudeSickness: false,
        roadClosure: false,
        ferryDependent: false,
        weatherWindow: true,
        weatherWindowMonths: [6, 7, 8, 9],
      },
      signaturePois: {
        types: ['NATIONAL_PARK', 'WILDLIFE_VIEWING', 'JUNGLE_ACTIVITY'],
        examples: [],
      },
      itinerarySkeleton: {
        dayThemes: ['到达', '丛林活动', '野生动物观察', '返程'],
        dailyPace: 'RELAX',
        restDaysRequired: [],
      },
      isActive: true,
    },
  });

  // ========== 西藏 (CN_XZ) ==========

  // 7. 拉萨周边轻量适应
  const cnXzLhasaRing = await prisma.routeDirection.create({
    data: {
      countryCode: 'CN_XZ',
      name: 'CN_XZ_LHASA_RING',
      nameCN: '拉萨周边轻量适应',
      nameEN: 'Lhasa Ring Light Acclimatization',
      description: '拉萨周边轻量级适应路线，适合初次进藏游客',
      tags: ['适应', '文化', '轻量'],
      regions: ['CN_XZ_LS'],
      entryHubs: ['Lhasa Gonggar Airport', 'Lhasa Railway Station'],
      seasonality: {
        bestMonths: [5, 6, 7, 8, 9, 10],
        avoidMonths: [12, 1, 2],
      },
      constraints: {
        maxElevationM: 3700,
        maxDailyAscentM: 200,
        maxSlope: 15,
        requiresPermit: false,
        requiresGuide: false,
        rapidAscentForbidden: true,
      },
      riskProfile: {
        altitudeSickness: true,
        roadClosure: false,
        ferryDependent: false,
        weatherWindow: false,
      },
      signaturePois: {
        types: ['TEMPLE', 'MONASTERY', 'VIEWPOINT'],
        examples: [],
      },
      itinerarySkeleton: {
        dayThemes: ['适应日', '文化游览', '适应日'],
        dailyPace: 'RELAX',
        restDaysRequired: [1, 3],
      },
      isActive: true,
    },
  });

  // 8. 拉萨-羊湖-日喀则走廊
  const cnXzShigatseCorridor = await prisma.routeDirection.create({
    data: {
      countryCode: 'CN_XZ',
      name: 'CN_XZ_SHIGATSE_CORRIDOR',
      nameCN: '拉萨-羊湖-日喀则走廊',
      nameEN: 'Lhasa-Yamdrok-Shigatse Corridor',
      description: '从拉萨经羊卓雍错到日喀则的经典路线，节奏可控',
      tags: ['文化', '湖泊', '摄影', '适应'],
      regions: ['CN_XZ_LS', 'CN_XZ_RK'],
      entryHubs: ['Lhasa Gonggar Airport', 'Lhasa Railway Station'],
      seasonality: {
        bestMonths: [5, 6, 7, 8, 9, 10],
        avoidMonths: [12, 1, 2],
      },
      constraints: {
        maxElevationM: 4500,
        maxDailyAscentM: 400,
        maxSlope: 20,
        requiresPermit: false,
        requiresGuide: false,
        rapidAscentForbidden: true,
      },
      riskProfile: {
        altitudeSickness: true,
        roadClosure: true, // 冬季可能封路
        ferryDependent: false,
        weatherWindow: true,
        weatherWindowMonths: [12, 1, 2],
      },
      signaturePois: {
        types: ['LAKE', 'TEMPLE', 'MONASTERY', 'VIEWPOINT'],
        examples: [],
      },
      itinerarySkeleton: {
        dayThemes: ['适应日', '羊湖游览', '日喀则', '返程'],
        dailyPace: 'BALANCED',
        restDaysRequired: [1],
      },
      isActive: true,
    },
  });

  // 9. 定日-珠峰入口
  const cnXzEbcGate = await prisma.routeDirection.create({
    data: {
      countryCode: 'CN_XZ',
      name: 'CN_XZ_EBC_GATE',
      nameCN: '定日-珠峰入口',
      nameEN: 'Tingri-Everest Base Camp Gate',
      description: '从定日到珠峰大本营入口的路线，需要许可和检查站',
      tags: ['高海拔', '极地', '许可', '检查站'],
      regions: ['CN_XZ_DR', 'CN_XZ_RK'],
      entryHubs: ['Lhasa Gonggar Airport', 'Shigatse'],
      seasonality: {
        bestMonths: [5, 6, 7, 8, 9, 10],
        avoidMonths: [12, 1, 2],
      },
      constraints: {
        maxElevationM: 5200,
        maxDailyAscentM: 500,
        maxSlope: 25,
        requiresPermit: true, // 需要边防证和珠峰保护区许可
        requiresGuide: true, // 需要当地向导
        rapidAscentForbidden: true,
      },
      riskProfile: {
        altitudeSickness: true,
        roadClosure: true,
        ferryDependent: false,
        weatherWindow: true,
        weatherWindowMonths: [12, 1, 2],
      },
      signaturePois: {
        types: ['CHECKPOINT', 'VIEWPOINT', 'BASE_CAMP'],
        examples: [],
      },
      itinerarySkeleton: {
        dayThemes: ['适应日', '前往定日', '检查站', '珠峰观景', '返程'],
        dailyPace: 'MODERATE',
        restDaysRequired: [1, 3],
      },
      isActive: true,
    },
  });

  console.log('路线方向创建完成！');
  console.log(`创建了 ${9} 条路线方向`);

  // 创建一些示例模板
  console.log('开始创建路线模板...');

  // EBC 经典 10 日模板
  await prisma.routeTemplate.create({
    data: {
      routeDirectionId: npEbcClassic.id,
      durationDays: 10,
      name: 'EBC 经典 10 日游',
      nameCN: 'EBC 经典 10 日游',
      nameEN: 'EBC Classic 10-Day Trek',
      dayPlans: [
        {
          day: 1,
          theme: '适应日',
          maxIntensity: 'LIGHT',
          maxElevationM: 2800,
          requiredNodes: ['Lukla'],
          optionalActivities: ['tea_house', 'viewpoint'],
        },
        {
          day: 2,
          theme: '适应日',
          maxIntensity: 'LIGHT',
          maxElevationM: 3440,
          requiredNodes: ['Namche Bazaar'],
          optionalActivities: ['tea_house', 'viewpoint'],
        },
        {
          day: 3,
          theme: '适应日',
          maxIntensity: 'LIGHT',
          maxElevationM: 3800,
          requiredNodes: [],
          optionalActivities: ['tea_house', 'viewpoint'],
        },
        {
          day: 4,
          theme: '徒步日',
          maxIntensity: 'MODERATE',
          maxElevationM: 4400,
          requiredNodes: ['Dingboche'],
          optionalActivities: ['tea_house', 'viewpoint'],
        },
        {
          day: 5,
          theme: '适应日',
          maxIntensity: 'LIGHT',
          maxElevationM: 4400,
          requiredNodes: [],
          optionalActivities: ['tea_house', 'viewpoint'],
        },
        {
          day: 6,
          theme: '徒步日',
          maxIntensity: 'MODERATE',
          maxElevationM: 4900,
          requiredNodes: ['Lobuche'],
          optionalActivities: ['tea_house', 'viewpoint'],
        },
        {
          day: 7,
          theme: '徒步日',
          maxIntensity: 'INTENSE',
          maxElevationM: 5200,
          requiredNodes: ['Gorakshep'],
          optionalActivities: ['base_camp', 'viewpoint'],
        },
        {
          day: 8,
          theme: '观景日',
          maxIntensity: 'MODERATE',
          maxElevationM: 5500,
          requiredNodes: ['Everest Base Camp'],
          optionalActivities: ['viewpoint'],
        },
        {
          day: 9,
          theme: '返程日',
          maxIntensity: 'MODERATE',
          maxElevationM: 3800,
          requiredNodes: ['Pheriche'],
          optionalActivities: ['tea_house'],
        },
        {
          day: 10,
          theme: '返程日',
          maxIntensity: 'MODERATE',
          maxElevationM: 2800,
          requiredNodes: ['Lukla'],
          optionalActivities: ['tea_house'],
        },
      ],
      defaultPacePreference: 'BALANCED',
      isActive: true,
    },
  });

  console.log('路线模板创建完成！');
}

main()
  .catch((e) => {
    console.error('错误:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

