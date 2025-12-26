// scripts/new-country-pack.ts
/**
 * 国家 Pack 生成模板
 * 
 * 生成新国家的 RouteDirection skeleton（3 条 RD + policy + regions）
 * 
 * 用法：
 *   npx ts-node --project tsconfig.backend.json scripts/new-country-pack.ts <countryCode> <countryName>
 * 
 * 示例：
 *   npx ts-node --project tsconfig.backend.json scripts/new-country-pack.ts IS Iceland
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  RouteDirectionArchetype,
  generateRouteDirectionFromArchetype,
  recommendArchetypesByRegion,
  getAllArchetypes,
} from '../src/route-directions/templates/route-direction-archetypes';

interface CountryPackSkeleton {
  countryCode: string;
  countryName: string;
  countryNameCN: string;
  routeDirections: RouteDirectionSkeleton[];
  regions: string[];
  policy: {
    defaultPace?: 'RELAX' | 'BALANCED' | 'CHALLENGE';
    defaultRiskTolerance?: 'low' | 'medium' | 'high';
  };
}

interface RouteDirectionSkeleton {
  name: string;
  nameCN: string;
  nameEN?: string;
  description?: string;
  tags: string[];
  regions: string[];
  entryHubs: string[];
  seasonality?: {
    bestMonths?: number[];
    avoidMonths?: number[];
  };
  constraints?: {
    hard?: {
      maxDailyRapidAscentM?: number;
      maxSlopePct?: number;
      requiresPermit?: boolean;
      requiresGuide?: boolean;
    };
    soft?: {
      maxDailyAscentM?: number;
      maxElevationM?: number;
      bufferTimeMin?: number;
    };
  };
  riskProfile?: {
    altitudeSickness?: boolean;
    roadClosure?: boolean;
    ferryDependent?: boolean;
    weatherWindow?: boolean;
    weatherWindowMonths?: number[];
  };
  signaturePois?: {
    types?: string[];
    examples?: string[];
  };
  itinerarySkeleton?: {
    dayThemes?: string[];
    dailyPace?: string;
    restDaysRequired?: number[];
  };
}

function generateCountryPack(
  countryCode: string,
  countryName: string,
  selectedArchetypes?: RouteDirectionArchetype[]
): CountryPackSkeleton {
  const countryNameCN = getCountryNameCN(countryCode, countryName);

  // 如果没有指定母型，使用推荐的默认母型
  let archetypesToUse: RouteDirectionArchetype[] = selectedArchetypes || [
    'URBAN_CULTURAL_EXPLORATION',
    'NATURE_SCENIC_LOOP',
    'FJORD_COASTLINE_DRIVING',
  ];

  // 如果只指定了部分母型，补充到3个
  if (archetypesToUse.length < 3) {
    const allArchetypes: RouteDirectionArchetype[] = [
      'HIGH_ALTITUDE_CULTURAL_TREKKING',
      'FJORD_COASTLINE_DRIVING',
      'URBAN_CULTURAL_EXPLORATION',
      'NATURE_SCENIC_LOOP',
      'ADVENTURE_CHALLENGE_ROUTE',
      'RELAXED_LEISURE_VACATION',
    ];
    const remaining = allArchetypes.filter(a => !archetypesToUse.includes(a));
    archetypesToUse = [...archetypesToUse, ...remaining.slice(0, 3 - archetypesToUse.length)];
  }

  // 使用母型模板生成 RouteDirection skeleton
  const routeDirections: RouteDirectionSkeleton[] = archetypesToUse.slice(0, 3).map((archetype, index) => {
    const skeleton = generateRouteDirectionFromArchetype(archetype, countryCode, {
      name: `${countryCode}_${archetype}`,
      nameCN: `${countryNameCN}${getArchetypeNameSuffix(archetype)}`,
      nameEN: `${countryName} ${getArchetypeNameSuffix(archetype, 'en')}`,
      regions: [`${countryCode}_REGION_${index + 1}`],
      entryHubs: [`${countryNameCN}入口${index + 1}`],
    });

    // 转换为 RouteDirectionSkeleton 格式
    return {
      name: skeleton.name!,
      nameCN: skeleton.nameCN!,
      nameEN: skeleton.nameEN,
      description: skeleton.description,
      tags: skeleton.tags || [],
      regions: skeleton.regions || [],
      entryHubs: skeleton.entryHubs || [],
      seasonality: skeleton.seasonality as any,
      constraints: skeleton.constraints as any,
      riskProfile: skeleton.riskProfile as any,
      signaturePois: skeleton.signaturePois as any,
      itinerarySkeleton: skeleton.itinerarySkeleton as any,
    };
  });

  // 生成 regions 列表
  const regions = [
    `${countryCode}_CAPITAL`,
    `${countryCode}_MAJOR_CITY_1`,
    `${countryCode}_NATURE_REGION_1`,
    `${countryCode}_NATURE_REGION_2`,
    `${countryCode}_ADVENTURE_REGION_1`,
    `${countryCode}_ADVENTURE_REGION_2`,
  ];

  return {
    countryCode,
    countryName,
    countryNameCN,
    routeDirections,
    regions,
    policy: {
      defaultPace: 'BALANCED',
      defaultRiskTolerance: 'medium',
    },
  };
}

/**
 * 获取母型名称后缀
 */
function getArchetypeNameSuffix(archetype: RouteDirectionArchetype, lang: 'zh' | 'en' = 'zh'): string {
  const suffixes: Record<RouteDirectionArchetype, { zh: string; en: string }> = {
    HIGH_ALTITUDE_CULTURAL_TREKKING: { zh: '高海拔文化徒步', en: 'High-altitude Cultural Trekking' },
    FJORD_COASTLINE_DRIVING: { zh: '峡湾海岸线自驾', en: 'Fjord/Coastline Driving' },
    URBAN_CULTURAL_EXPLORATION: { zh: '城市文化探索', en: 'Urban Cultural Exploration' },
    NATURE_SCENIC_LOOP: { zh: '自然风光环线', en: 'Nature Scenic Loop' },
    ADVENTURE_CHALLENGE_ROUTE: { zh: '冒险挑战路线', en: 'Adventure Challenge Route' },
    RELAXED_LEISURE_VACATION: { zh: '轻松休闲度假', en: 'Relaxed Leisure Vacation' },
  };
  return suffixes[archetype]?.[lang] || archetype;
}

function getCountryNameCN(countryCode: string, countryName: string): string {
  // 简单的国家名称映射（可以扩展）
  const nameMap: Record<string, string> = {
    'IS': '冰岛',
    'NO': '挪威',
    'NZ': '新西兰',
    'NP': '尼泊尔',
    'CN_XZ': '西藏',
    'BT': '不丹',
    'FI': '芬兰',
    'SE': '瑞典',
    'DK': '丹麦',
    'CH': '瑞士',
    'AT': '奥地利',
    'IT': '意大利',
    'FR': '法国',
    'ES': '西班牙',
    'PT': '葡萄牙',
    'GR': '希腊',
    'TR': '土耳其',
    'JP': '日本',
    'KR': '韩国',
    'TH': '泰国',
    'VN': '越南',
    'ID': '印度尼西亚',
    'MY': '马来西亚',
    'SG': '新加坡',
    'PH': '菲律宾',
    'IN': '印度',
    'AU': '澳大利亚',
    'CA': '加拿大',
    'US': '美国',
    'MX': '墨西哥',
    'BR': '巴西',
    'AR': '阿根廷',
    'CL': '智利',
    'PE': '秘鲁',
    'CO': '哥伦比亚',
    'ZA': '南非',
    'EG': '埃及',
    'MA': '摩洛哥',
    'KE': '肯尼亚',
    'TZ': '坦桑尼亚',
  };

  return nameMap[countryCode] || countryName;
}

function saveCountryPack(pack: CountryPackSkeleton, outputDir: string): void {
  const outputPath = path.join(outputDir, `country-pack-${pack.countryCode.toLowerCase()}.json`);
  
  // 确保输出目录存在
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 保存 JSON 文件
  fs.writeFileSync(
    outputPath,
    JSON.stringify(pack, null, 2),
    'utf-8'
  );

  console.log(`✅ 国家 Pack 已生成: ${outputPath}`);
  console.log(`\n包含内容：`);
  console.log(`  - ${pack.routeDirections.length} 条 RouteDirection skeleton（基于母型模板）`);
  console.log(`  - ${pack.regions.length} 个 regions`);
  console.log(`  - 默认 policy 配置`);
  console.log(`\n使用的母型：`);
  pack.routeDirections.forEach((rd, index) => {
    console.log(`  ${index + 1}. ${rd.nameCN} (${rd.name})`);
  });
  console.log(`\n下一步：`);
  console.log(`  1. 编辑 ${outputPath}，填写具体的 regions、corridor、signaturePois 等信息`);
  console.log(`  2. 运行 pack-validator.ts 检查完整性`);
  console.log(`  3. 使用 seed-route-directions.ts 导入到数据库`);
  console.log(`\n提示：`);
  console.log(`  - 所有 RouteDirection 都基于 6 大母型模板生成`);
  console.log(`  - 可以根据国家特点调整约束、风险画像、季节性等参数`);
  console.log(`  - 查看 src/route-directions/templates/route-direction-archetypes.ts 了解母型详情`);
}

// 主函数
function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error('用法: npx ts-node scripts/new-country-pack.ts <countryCode> [countryName]');
    console.error('示例: npx ts-node scripts/new-country-pack.ts IS Iceland');
    process.exit(1);
  }

  const countryCode = args[0].toUpperCase();
  const countryName = args[1] || countryCode;

  console.log(`生成 ${countryCode} (${countryName}) 的国家 Pack...`);

  const pack = generateCountryPack(countryCode, countryName);
  const outputDir = path.join(__dirname, '../data/country-packs');

  saveCountryPack(pack, outputDir);
}

if (require.main === module) {
  main();
}

