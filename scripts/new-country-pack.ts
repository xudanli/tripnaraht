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

function generateCountryPack(countryCode: string, countryName: string): CountryPackSkeleton {
  const countryNameCN = getCountryNameCN(countryCode, countryName);

  // 生成 3 条典型的 RouteDirection skeleton
  const routeDirections: RouteDirectionSkeleton[] = [
    {
      name: `${countryCode}_CULTURAL_CITIES`,
      nameCN: `${countryNameCN}城市文化之旅`,
      nameEN: `${countryName} Cultural Cities`,
      description: `探索${countryNameCN}的主要城市和文化景点，适合初次到访的游客。`,
      tags: ['文化', '城市', '博物馆', '历史'],
      regions: [`${countryCode}_CAPITAL`, `${countryCode}_MAJOR_CITY_1`],
      entryHubs: [`${countryNameCN}首都机场`, `${countryNameCN}主要城市`],
      seasonality: {
        bestMonths: [5, 6, 7, 8, 9], // 默认夏季
        avoidMonths: [12, 1, 2], // 默认冬季
      },
      constraints: {
        soft: {
          maxDailyAscentM: 200,
          maxElevationM: 1000,
        },
      },
      riskProfile: {
        altitudeSickness: false,
        roadClosure: false,
      },
      signaturePois: {
        types: ['MUSEUM', 'HISTORIC_SITE', 'CITY_CENTER'],
      },
      itinerarySkeleton: {
        dayThemes: ['抵达适应', '城市探索', '文化体验', '购物休闲', '返程'],
        dailyPace: 'MODERATE',
      },
    },
    {
      name: `${countryCode}_NATURE_SCENIC`,
      nameCN: `${countryNameCN}自然风光`,
      nameEN: `${countryName} Nature & Scenic`,
      description: `探索${countryNameCN}的自然风光和户外景点，适合喜欢自然和摄影的游客。`,
      tags: ['自然', '摄影', '户外', '风景'],
      regions: [`${countryCode}_NATURE_REGION_1`, `${countryCode}_NATURE_REGION_2`],
      entryHubs: [`${countryNameCN}主要城市`, `${countryNameCN}自然区域入口`],
      seasonality: {
        bestMonths: [6, 7, 8, 9], // 默认夏季
        avoidMonths: [12, 1, 2, 3], // 默认冬季
      },
      constraints: {
        soft: {
          maxDailyAscentM: 500,
          maxElevationM: 2000,
        },
      },
      riskProfile: {
        altitudeSickness: false,
        weatherWindow: true,
        weatherWindowMonths: [6, 7, 8],
      },
      signaturePois: {
        types: ['VIEWPOINT', 'NATIONAL_PARK', 'SCENIC_ROUTE'],
      },
      itinerarySkeleton: {
        dayThemes: ['抵达', '自然探索', '摄影日', '户外活动', '返程'],
        dailyPace: 'MODERATE',
      },
    },
    {
      name: `${countryCode}_ADVENTURE_CHALLENGE`,
      nameCN: `${countryNameCN}挑战之旅`,
      nameEN: `${countryName} Adventure Challenge`,
      description: `${countryNameCN}的挑战性路线，适合喜欢冒险和挑战的游客。`,
      tags: ['挑战', '徒步', '冒险', '户外'],
      regions: [`${countryCode}_ADVENTURE_REGION_1`, `${countryCode}_ADVENTURE_REGION_2`],
      entryHubs: [`${countryNameCN}挑战区域入口`],
      seasonality: {
        bestMonths: [6, 7, 8], // 默认夏季
        avoidMonths: [12, 1, 2, 3, 4], // 默认冬季和早春
      },
      constraints: {
        hard: {
          maxDailyRapidAscentM: 800,
          requiresPermit: false,
          requiresGuide: false,
        },
        soft: {
          maxDailyAscentM: 1000,
          maxElevationM: 3000,
        },
      },
      riskProfile: {
        altitudeSickness: true,
        roadClosure: true,
        weatherWindow: true,
        weatherWindowMonths: [6, 7, 8],
      },
      signaturePois: {
        types: ['MOUNTAIN_PASS', 'TRAIL', 'CHALLENGE_POINT'],
      },
      itinerarySkeleton: {
        dayThemes: ['抵达适应', '挑战日1', '挑战日2', '恢复日', '返程'],
        dailyPace: 'INTENSE',
        restDaysRequired: [3, 5],
      },
    },
  ];

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
  console.log(`  - ${pack.routeDirections.length} 条 RouteDirection skeleton`);
  console.log(`  - ${pack.regions.length} 个 regions`);
  console.log(`  - 默认 policy 配置`);
  console.log(`\n下一步：`);
  console.log(`  1. 编辑 ${outputPath}，填写具体的 regions、corridor、signaturePois 等信息`);
  console.log(`  2. 运行 pack-validator.ts 检查完整性`);
  console.log(`  3. 使用 seed-route-directions.ts 导入到数据库`);
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

