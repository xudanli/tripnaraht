// scripts/seed-peru-route-directions.ts
/**
 * 🇵🇪 Peru RouteDirection Pack (Production Ready)
 * 
 * 从"地理风险" → "人类生理极限"
 * 
 * 如果说冰岛考验的是自然，
 * 那秘鲁考验的是人。
 * 
 * 国家级新变量（这是冰岛没有的）:
 * - HumanPhysiologyProfile
 *   - altitudeAdaptationRequired: true
 *   - hypoxiaRiskCurve: true
 *   - acclimatizationDays: mandatory
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

/**
 * 创建 PostGIS LINESTRING 几何数据
 */
function createLineString(coordinates: Array<[number, number]>): string {
  const points = coordinates.map(([lng, lat]) => `${lng} ${lat}`).join(', ');
  return `SRID=4326;LINESTRING(${points})`;
}

async function main() {
  console.log('🇵🇪 开始创建秘鲁 RouteDirection Pack...\n');
  console.log('⚠️  秘鲁核心现实：高海拔、缺氧风险、强制适应期\n');

  // ========== RD-PE-01: Inca Trail ==========
  console.log('📌 创建 RD-PE-01: Inca Trail...');
  
  const pe01Corridor = createLineString([
    [-77.04, -12.05],  // Cusco
    [-72.54, -13.16],  // Ollantaytambo
    [-72.58, -13.26],  // Machu Picchu
    [-72.54, -13.16],  // Back to Ollantaytambo
  ]);

  const rdPe01 = await prisma.routeDirection.create({
    data: {
      uuid: randomUUID(),
      countryCode: 'PE',
      name: 'INCA_TRAIL',
      nameCN: '印加古道 · 逐级适应',
      nameEN: 'Inca Trail · Gradual Acclimatization',
      description: '文明不是建在低地的。印加古道是经典但高生理成本路线，需要逐级适应高海拔环境。',
      tags: ['徒步', '文化', '高海拔', '历史'],
      regions: ['Cusco', 'Sacred Valley', 'Machu Picchu'],
      entryHubs: ['Cusco'],
      seasonality: {
        bestMonths: [5, 6, 7, 8, 9],
        avoidMonths: [11, 12, 1, 2, 3],
        typicalDurationDays: 5,
      },
      constraints: {
        hardConstraints: {
          maxElevationM: 4200,
          mandatoryAcclimatizationDays: 2, // 强制适应 2 天
          rapidAscentForbidden: true,
        },
        softConstraints: {
          maxDailyAscentM: 700,
          bufferTimeMin: 120,
        },
      },
      riskProfile: {
        altitudeSickness: true, // 高反风险
        roadClosure: false,
        weatherWindow: false,
        rescueDifficulty: 'MEDIUM',
      },
      signaturePois: {
        pois: [
          { poiId: 'machu_picchu', weight: 1.0, name: 'Machu Picchu' },
          { poiId: 'ollantaytambo', weight: 0.9, name: 'Ollantaytambo' },
          { poiId: 'sacred_valley', weight: 0.8, name: 'Sacred Valley' },
        ],
        types: ['CULTURAL_SITE', 'TRAIL', 'ARCHAEOLOGICAL', 'MOUNTAIN'],
      },
      itinerarySkeleton: {
        dayThemes: ['适应日', '适应日', '徒步日', '到达日', '返程'],
        dailyPace: 'MODERATE',
        restDaysRequired: [1, 2], // 前 2 天必须休息适应
        objectiveWeights: {
          preferCulture: 0.5,
          preferHistory: 0.3,
        },
      },
      metadata: {
        routeType: 'HIKING',
        philosophy: '文明不是建在低地的。',
        humanPhysiologyProfile: {
          altitudeAdaptationRequired: true,
          hypoxiaRiskCurve: true,
          acclimatizationDays: 2, // 强制适应 2 天
          maxElevationM: 4200,
        },
        demDecisionPoints: {
          gradualAscentRequired: true, // 必须逐级适应
          altitudeSicknessRisk: 'HIGH', // 高反风险高
        },
        failureProfile: {
          commonFailureDays: [1, 2],
          typicalFailureReason: ['altitude', 'fatigue'],
          rescueDifficulty: 'MEDIUM',
        },
      },
      isActive: true,
      status: 'active',
      updatedAt: new Date(),
    },
  });

  await prisma.$executeRawUnsafe(`
    UPDATE "RouteDirection"
    SET "corridorGeom" = ST_GeogFromText($1)
    WHERE id = ${rdPe01.id}
  `, pe01Corridor);

  console.log(`✅ RD-PE-01 创建成功 (ID: ${rdPe01.id})\n`);

  // ========== RD-PE-02: Ausangate Circuit ==========
  console.log('📌 创建 RD-PE-02: Ausangate Circuit...');

  const pe02Corridor = createLineString([
    [-71.97, -13.52],  // Cusco
    [-71.20, -13.79],  // Ausangate Base
    [-71.15, -13.85],  // Ausangate Circuit
    [-71.20, -13.79],  // Back to Base
  ]);

  const rdPe02 = await prisma.routeDirection.create({
    data: {
      uuid: randomUUID(),
      countryCode: 'PE',
      name: 'AUSANGATE_CIRCUIT',
      nameCN: '奥桑加特环线 · 生理极限',
      nameEN: 'Ausangate Circuit · Human Endurance Test',
      description: '这不是风景问题，是身体问题。奥桑加特环线是人类耐力测试，需要高海拔适应和向导。',
      tags: ['徒步', '高海拔', '挑战', '极限'],
      regions: ['Ausangate'],
      entryHubs: ['Cusco'],
      seasonality: {
        bestMonths: [5, 6, 7, 8, 9],
        avoidMonths: [11, 12, 1, 2, 3],
        typicalDurationDays: 6,
      },
      constraints: {
        hardConstraints: {
          maxElevationM: 5200,
          rapidAscentForbidden: true,
          guideRequired: true, // 必须向导
          mandatoryAcclimatizationDays: 3, // 强制适应 3 天
        },
        softConstraints: {
          maxDailyAscentM: 600,
          bufferTimeMin: 180,
        },
      },
      riskProfile: {
        altitudeSickness: true,
        roadClosure: false,
        weatherWindow: false,
        rescueDifficulty: 'HIGH',
      },
      signaturePois: {
        pois: [
          { poiId: 'ausangate_peak', weight: 1.0, name: 'Ausangate Peak' },
          { poiId: 'rainbow_mountain', weight: 0.9, name: 'Rainbow Mountain' },
        ],
        types: ['MOUNTAIN', 'TRAIL', 'HIGH_ALTITUDE', 'WILDERNESS'],
      },
      itinerarySkeleton: {
        dayThemes: ['适应日', '适应日', '适应日', '徒步日', '高海拔挑战', '返程'],
        dailyPace: 'INTENSE',
        restDaysRequired: [1, 2, 3], // 前 3 天必须休息适应
        objectiveWeights: {
          preferChallenge: 0.5,
          preferUniqueness: 0.3,
        },
      },
      metadata: {
        routeType: 'HIKING',
        philosophy: '这不是风景问题，是身体问题。',
        humanPhysiologyProfile: {
          altitudeAdaptationRequired: true,
          hypoxiaRiskCurve: true,
          acclimatizationDays: 3, // 强制适应 3 天
          maxElevationM: 5200,
        },
        demDecisionPoints: {
          isHumanEnduranceTest: true, // 人类耐力测试
          altitudeSicknessRisk: 'VERY_HIGH', // 高反风险极高
          guideMandatory: true, // 向导必须
        },
        antiPersona: [
          '高反经验为 0',
          '追求舒适',
          '无高海拔适应经验',
        ],
        failureProfile: {
          commonFailureDays: [1, 2, 3],
          typicalFailureReason: ['altitude', 'hypoxia', 'fatigue'],
          rescueDifficulty: 'HIGH',
        },
      },
      isActive: true,
      status: 'active',
      updatedAt: new Date(),
    },
  });

  await prisma.$executeRawUnsafe(`
    UPDATE "RouteDirection"
    SET "corridorGeom" = ST_GeogFromText($1)
    WHERE id = ${rdPe02.id}
  `, pe02Corridor);

  console.log(`✅ RD-PE-02 创建成功 (ID: ${rdPe02.id})\n`);

  // ========== RD-PE-03: Sacred Valley ==========
  console.log('📌 创建 RD-PE-03: Sacred Valley...');

  const pe03Corridor = createLineString([
    [-77.04, -12.05],  // Cusco
    [-72.54, -13.16],  // Ollantaytambo
    [-72.58, -13.26],  // Machu Picchu
    [-72.00, -13.30],  // Pisac
  ]);

  const rdPe03 = await prisma.routeDirection.create({
    data: {
      uuid: randomUUID(),
      countryCode: 'PE',
      name: 'SACRED_VALLEY_CULTURAL_BUFFER',
      nameCN: '圣谷文化缓冲',
      nameEN: 'Sacred Valley · Cultural Buffer',
      description: '让身体追上灵魂。圣谷文化缓冲路线适合高海拔适应，同时体验印加文化。',
      tags: ['文化', '适应', '低强度'],
      regions: ['Sacred Valley'],
      entryHubs: ['Cusco'],
      seasonality: {
        bestMonths: [5, 6, 7, 8, 9, 10],
        avoidMonths: [11, 12, 1, 2, 3],
        typicalDurationDays: 4,
      },
      constraints: {
        hardConstraints: {},
        softConstraints: {
          gradualAscent: true, // 逐级爬升
          bufferTimeMin: 60,
        },
      },
      riskProfile: {
        altitudeSickness: false,
        roadClosure: false,
        weatherWindow: false,
        rescueDifficulty: 'LOW',
      },
      signaturePois: {
        pois: [
          { poiId: 'pisac', weight: 0.9, name: 'Pisac' },
          { poiId: 'ollantaytambo', weight: 1.0, name: 'Ollantaytambo' },
          { poiId: 'moray', weight: 0.8, name: 'Moray' },
        ],
        types: ['CULTURAL_SITE', 'ARCHAEOLOGICAL', 'VIEWPOINT'],
      },
      itinerarySkeleton: {
        dayThemes: ['适应日', '文化体验', '适应日', '返程'],
        dailyPace: 'RELAX',
        restDaysRequired: [],
        objectiveWeights: {
          preferCulture: 0.5,
          preferComfort: 0.3,
        },
      },
      metadata: {
        routeType: 'CULTURAL_SCENIC',
        philosophy: '让身体追上灵魂。',
        humanPhysiologyProfile: {
          altitudeAdaptationRequired: true,
          hypoxiaRiskCurve: false, // 低风险
          acclimatizationDays: 1, // 建议 1 天适应
          maxElevationM: 3400,
        },
        demDecisionPoints: {
          isCulturalBuffer: true, // 文化缓冲带
          gradualAscent: true, // 逐级爬升
        },
        failureProfile: {
          commonFailureDays: [],
          typicalFailureReason: [],
          rescueDifficulty: 'LOW',
        },
      },
      isActive: true,
      status: 'active',
      updatedAt: new Date(),
    },
  });

  await prisma.$executeRawUnsafe(`
    UPDATE "RouteDirection"
    SET "corridorGeom" = ST_GeogFromText($1)
    WHERE id = ${rdPe03.id}
  `, pe03Corridor);

  console.log(`✅ RD-PE-03 创建成功 (ID: ${rdPe03.id})\n`);

  // ========== 总结 ==========
  console.log('================================================================================');
  console.log('🇵🇪 秘鲁 RouteDirection Pack 创建完成！');
  console.log('================================================================================');
  console.log(`✅ RD-PE-01: Inca Trail (ID: ${rdPe01.id}) - 逐级适应`);
  console.log(`✅ RD-PE-02: Ausangate Circuit (ID: ${rdPe02.id}) - 生理极限`);
  console.log(`✅ RD-PE-03: Sacred Valley (ID: ${rdPe03.id}) - 文化缓冲`);
  console.log('================================================================================');
  console.log('\n📊 系统价值：');
  console.log('  ✅ 人类生理极限纳入模型');
  console.log('  ✅ 高海拔适应期强制要求');
  console.log('  ✅ 缺氧风险曲线');
  console.log('  ✅ 从"地理风险" → "人类生理极限"');
  console.log('\n👉 如果说冰岛考验的是自然，那秘鲁考验的是人。');
  console.log('================================================================================\n');
}

main()
  .catch((e) => {
    console.error('❌ 创建失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

