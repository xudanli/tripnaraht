#!/usr/bin/env ts-node

/**
 * 导入格陵兰的准备度 Pack 数据
 * 
 * 使用方法:
 *   npx ts-node scripts/import-greenland-readiness-pack.ts
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { ReadinessPack } from '../src/trips/readiness/types/readiness-pack.types';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function logSuccess(message: string) {
  console.log(`${colors.green}✅ ${message}${colors.reset}`);
}

function logError(message: string) {
  console.log(`${colors.red}❌ ${message}${colors.reset}`);
}

function logInfo(message: string) {
  console.log(`${colors.blue}ℹ️  ${message}${colors.reset}`);
}

function logWarning(message: string) {
  console.log(`${colors.yellow}⚠️  ${message}${colors.reset}`);
}

/**
 * 从 LocalizedString 提取中英文字段
 */
function extractLocalizedFields(value: string | { en: string; zh?: string } | undefined): {
  default: string | undefined;
  en: string | undefined;
  cn: string | undefined;
} {
  if (!value) {
    return { default: undefined, en: undefined, cn: undefined };
  }
  if (typeof value === 'string') {
    return { default: value, en: value, cn: undefined };
  }
  return {
    default: value.en, // 默认使用英文
    en: value.en,
    cn: value.zh,
  };
}

/**
 * 修复数据格式问题，使其符合后端类型定义
 */
function fixPackDataFormat(pack: any): ReadinessPack {
  // 修复 sources 中的 type
  if (pack.sources) {
    pack.sources = pack.sources.map((source: any) => {
      if (source.type === 'json') {
        source.type = 'api';
      }
      return source;
    });
  }

  // 修复 rules 中的 category 和 severity
  if (pack.rules) {
    pack.rules = pack.rules.map((rule: any) => {
      // category: "safety_critical" -> "safety_hazards"
      if (rule.category === 'safety_critical') {
        rule.category = 'safety_hazards';
      }
      // severity: "extreme" -> "high"
      if (rule.severity === 'extreme') {
        rule.severity = 'high';
      }
      // 修复 when 条件中的 "or" -> "any"
      if (rule.when && typeof rule.when === 'object') {
        rule.when = fixCondition(rule.when);
      }
      return rule;
    });
  }

  // 修复 hazards 中的 type 和 severity
  if (pack.hazards) {
    pack.hazards = pack.hazards.map((hazard: any) => {
      // 映射 hazard type
      const typeMap: Record<string, string> = {
        'water_iceberg': 'water_safety',
        'weather_extreme_cold': 'weather_extreme',
        'wildlife_polar_bear': 'wildlife',
        'terrain_glacier_crevasse': 'terrain',
        'weather_whiteout': 'weather_extreme',
      };
      if (typeMap[hazard.type]) {
        hazard.type = typeMap[hazard.type];
      }
      // severity: "extreme" -> "high"
      if (hazard.severity === 'extreme') {
        hazard.severity = 'high';
      }
      return hazard;
    });
  }

  return pack as ReadinessPack;
}

/**
 * 递归修复 Condition 中的 "or" -> "any"
 */
function fixCondition(condition: any): any {
  if (!condition || typeof condition !== 'object') {
    return condition;
  }

  // 如果是数组，递归处理每个元素
  if (Array.isArray(condition)) {
    return condition.map(fixCondition);
  }

  // 如果包含 "or" 字段，改为 "any"
  if ('or' in condition) {
    const newCondition: any = { ...condition };
    newCondition.any = newCondition.or;
    delete newCondition.or;
    return newCondition;
  }

  // 递归处理所有属性
  const result: any = {};
  for (const [key, value] of Object.entries(condition)) {
    result[key] = fixCondition(value);
  }
  return result;
}

/**
 * 保存 Pack 到数据库
 */
async function savePack(pack: ReadinessPack): Promise<boolean> {
  try {
    // 检查是否已存在
    const existing = await prisma.readinessPack.findUnique({
      where: { packId: pack.packId },
    });

    // 提取中英文字段
    const displayNameFields = extractLocalizedFields(pack.displayName);
    const regionFields = extractLocalizedFields(pack.geo.region as any);
    const cityFields = extractLocalizedFields(pack.geo.city as any);

    const packData = {
      packId: pack.packId,
      destinationId: pack.destinationId,
      displayName: displayNameFields.default || '',
      displayNameEN: displayNameFields.en,
      displayNameCN: displayNameFields.cn,
      version: pack.version,
      lastReviewedAt: new Date(pack.lastReviewedAt),
      countryCode: pack.geo.countryCode,
      region: regionFields.default,
      regionEN: regionFields.en,
      regionCN: regionFields.cn,
      city: cityFields.default,
      cityEN: cityFields.en,
      cityCN: cityFields.cn,
      latitude: pack.geo.lat,
      longitude: pack.geo.lng,
      packData: pack as any, // 存储完整 Pack JSON
      isActive: true,
      updatedAt: new Date(),
    };

    if (existing) {
      // 更新现有记录
      await prisma.readinessPack.update({
        where: { packId: pack.packId },
        data: packData,
      });
      logSuccess(`已更新 Pack: ${pack.packId}`);
    } else {
      // 创建新记录
      await prisma.readinessPack.create({
        data: {
          ...packData,
          id: packData.packId || randomUUID(),
        } as any,
      });
      logSuccess(`已创建 Pack: ${pack.packId}`);
    }

    return true;
  } catch (error: any) {
    logError(`保存 Pack 失败 ${pack.packId}: ${error.message}`);
    console.error(error);
    return false;
  }
}

/**
 * 从 JSON 文件导入 Pack
 */
async function importPackFromFile(filePath: string): Promise<boolean> {
  try {
    if (!existsSync(filePath)) {
      logError(`文件不存在: ${filePath}`);
      return false;
    }

    logInfo(`读取文件: ${filePath}`);
    const content = readFileSync(filePath, 'utf-8');
    const pack = JSON.parse(content) as ReadinessPack;

    // 修复数据格式
    logInfo('修复数据格式...');
    const fixedPack = fixPackDataFormat(pack);

    // 基本验证
    if (!fixedPack.packId || !fixedPack.destinationId || !fixedPack.rules) {
      throw new Error('Invalid pack format: missing required fields');
    }

    return await savePack(fixedPack);
  } catch (error: any) {
    logError(`从文件导入 Pack 失败 ${filePath}: ${error.message}`);
    console.error(error);
    return false;
  }
}

/**
 * 从 JSON 对象导入 Pack
 */
async function importPackFromJson(pack: ReadinessPack): Promise<boolean> {
  try {
    // 修复数据格式
    logInfo('修复数据格式...');
    const fixedPack = fixPackDataFormat(pack);

    // 基本验证
    if (!fixedPack.packId || !fixedPack.destinationId || !fixedPack.rules) {
      throw new Error('Invalid pack format: missing required fields');
    }

    return await savePack(fixedPack);
  } catch (error: any) {
    logError(`从 JSON 导入 Pack 失败: ${error.message}`);
    console.error(error);
    return false;
  }
}

async function main() {
  console.log(`${colors.cyan}
╔══════════════════════════════════════════════════════════════╗
║       格陵兰准备度 Pack 导入工具                              ║
╚══════════════════════════════════════════════════════════════╝${colors.reset}\n`);

  // 格陵兰 Pack 数据（从用户提供的 JSON）
  const greenlandPack = {
    "packId": "pack.gl.greenland",
    "destinationId": "GL-GREENLAND",
    "displayName": {
      "en": "Greenland Travel Readiness",
      "zh": "格陵兰旅行准备度"
    },
    "version": "1.0.0",
    "lastReviewedAt": "2026-01-30T00:00:00Z",
    "geo": {
      "countryCode": "GL",
      "region": "Greenland",
      "city": "Nuuk",
      "lat": 64.1814,
      "lng": -51.6941
    },
    "supportedSeasons": ["summer", "winter", "shoulder", "all"],
    "sources": [
      {
        "sourceId": "src.greenland.tourism",
        "authority": "Visit Greenland / Greenland Tourism Authority",
        "type": "api",
        "title": {
          "en": "Greenland Travel Safety & Information",
          "zh": "格陵兰旅行安全与信息"
        },
        "canonicalUrl": "https://www.visitgreenland.com"
      },
      {
        "sourceId": "src.dmi.denmark",
        "authority": "Danish Meteorological Institute",
        "type": "html",
        "title": {
          "en": "Arctic Weather Forecasts & Warnings",
          "zh": "北极天气预报和预警"
        },
        "canonicalUrl": "https://www.dmi.dk"
      },
      {
        "sourceId": "src.usgs.greenland",
        "authority": "USGS Greenland Ice Sheet Project",
        "type": "api",
        "title": {
          "en": "Glacier & Ice Sheet Monitoring",
          "zh": "冰川与冰盖监测"
        },
        "canonicalUrl": "https://www.usgs.gov"
      },
      {
        "sourceId": "src.iucn.polar",
        "authority": "IUCN Polar Bear Specialist Group",
        "type": "api",
        "title": {
          "en": "Polar Bear Risk Assessment",
          "zh": "北极熊风险评估"
        },
        "canonicalUrl": "https://pbsg.npolar.no"
      }
    ],
    "rules": [
      {
        "id": "rule.gl.iceberg-kayaking-danger",
        "category": "safety_hazards",
        "severity": "high",
        "appliesTo": {
          "seasons": ["summer", "shoulder"],
          "activities": ["kayaking", "boating", "water-sports"],
          "travelerTags": []
        },
        "when": {
          "any": [
            {
              "containsAny": {
                "path": "itinerary.activities",
                "values": ["kayaking", "boating", "water-sports", "ilulissat", "disko-bay"]
              }
            }
          ]
        },
        "then": {
          "level": "blocker",
          "message": {
            "en": "⚠️ LAYER 1 RED LINE: Greenland's icebergs are deadly. Only 10-15% of an iceberg is visible above water. Icebergs can suddenly flip, calve, or create massive waves. Kayaking near icebergs without professional guide = high probability of death. Ilulissat Glacier produces 40 billion tons of ice annually. Mandatory: professional guide, dry suit, life jacket, maintain 500-1000m distance.",
            "zh": "⚠️ 第1层红线：格陵兰冰山致命。冰山仅10-15%露出水面。冰山可能突然翻转、崩解或产生巨浪。在没有专业向导的情况下在冰山附近皮划艇=高死亡概率。伊卢利萨特冰川每年产生400亿吨冰。强制：专业向导、干衣、救生衣、保持500-1000米距离。"
          },
          "tasks": [
            {
              "title": {
                "en": "Book kayaking tour ONLY with licensed professional guide",
                "zh": "仅与持证专业向导预订皮划艇旅游"
              },
              "dueOffsetDays": -14,
              "tags": ["booking", "safety", "critical"]
            },
            {
              "title": {
                "en": "Acquire dry suit (minimum 5mm neoprene) and life jacket",
                "zh": "获取干衣（最少5毫米氯丁橡胶）和救生衣"
              },
              "dueOffsetDays": -30,
              "tags": ["gear", "safety"]
            },
            {
              "title": {
                "en": "Verify guide will maintain 500-1000m distance from glacier front",
                "zh": "验证向导将保持距冰川前端500-1000米的距离"
              },
              "dueOffsetDays": -7,
              "tags": ["verification", "safety"]
            },
            {
              "title": {
                "en": "Carry satellite communicator and emergency beacon",
                "zh": "携带卫星通讯器和应急信标"
              },
              "dueOffsetDays": -7,
              "tags": ["gear", "safety"]
            }
          ],
          "askUser": [
            {
              "en": "Have you done cold water kayaking before?",
              "zh": "您之前做过冷水皮划艇吗？"
            },
            {
              "en": "Are you comfortable with icebergs and potential capsizing?",
              "zh": "您对冰山和潜在的翻覆感到舒适吗？"
            },
            {
              "en": "Can you swim in cold water?",
              "zh": "您能在冷水中游泳吗？"
            }
          ]
        },
        "evidence": [
          {
            "sourceId": "src.usgs.greenland",
            "sectionId": "iceberg_hazards",
            "quote": "Icebergs: only 10-15% visible above water. Can flip suddenly, creating waves 5-10m high. Kayaking near icebergs without guide = extreme risk.",
            "retrievedAt": "2026-01-30T00:00:00Z"
          }
        ],
        "notes": {
          "en": "This is a Layer 1 red line rule - violation can be fatal. TripNARA must enforce this strictly.",
          "zh": "这是第1层红线规则 - 违反可能致命。TripNARA必须严格执行。"
        }
      },
      {
        "id": "rule.gl.extreme-cold-protection",
        "category": "safety_hazards",
        "severity": "high",
        "appliesTo": {
          "seasons": ["winter", "shoulder"],
          "activities": ["hiking", "outdoor", "adventure"],
          "travelerTags": []
        },
        "when": {
          "any": [
            {
              "containsAny": {
                "path": "itinerary.activities",
                "values": ["hiking", "outdoor", "adventure", "camping"]
              }
            },
            {
              "any": [
                {
                  "eq": {
                    "path": "itinerary.season",
                    "value": "winter"
                  }
                },
                {
                  "eq": {
                    "path": "itinerary.season",
                    "value": "shoulder"
                  }
                }
              ]
            }
          ]
        },
        "then": {
          "level": "blocker",
          "message": {
            "en": "⚠️ LAYER 1 RED LINE: Greenland winter temperatures reach -40°C to -50°C (wind chill -70°C). Exposed skin freezes in 5-10 minutes. Hypothermia is fatal. Inadequate gear = death. Winter travel is ONLY for professional expeditions with complete self-sufficiency.",
            "zh": "⚠️ 第1层红线：格陵兰冬季温度达-40°C至-50°C（风寒-70°C）。暴露皮肤5-10分钟内冻伤。失温致命。装备不足=死亡。冬季旅行仅适合具有完全自给自足能力的专业远征队。"
          },
          "tasks": [
            {
              "title": {
                "en": "Acquire professional Arctic extreme cold gear (not regular winter gear)",
                "zh": "获取专业北极极端寒冷装备（不是普通冬季装备）"
              },
              "dueOffsetDays": -60,
              "tags": ["gear", "safety", "critical"]
            },
            {
              "title": {
                "en": "Test all gear in extreme cold conditions before departure",
                "zh": "出发前在极端寒冷条件下测试所有装备"
              },
              "dueOffsetDays": -30,
              "tags": ["verification", "safety"]
            },
            {
              "title": {
                "en": "Learn frostbite recognition and hypothermia treatment",
                "zh": "学习冻伤识别和失温治疗"
              },
              "dueOffsetDays": -14,
              "tags": ["education", "safety"]
            },
            {
              "title": {
                "en": "Carry emergency shelter, high-calorie food, and heat sources",
                "zh": "携带应急庇护所、高热量食物和热源"
              },
              "dueOffsetDays": -7,
              "tags": ["gear", "safety"]
            }
          ],
          "askUser": [
            {
              "en": "Do you have professional Arctic extreme cold gear?",
              "zh": "您有专业的北极极端寒冷装备吗？"
            },
            {
              "en": "Have you experienced temperatures below -30°C before?",
              "zh": "您之前经历过低于-30°C的温度吗？"
            },
            {
              "en": "Are you part of a professional expedition team?",
              "zh": "您是专业远征队的一部分吗？"
            }
          ]
        },
        "evidence": [
          {
            "sourceId": "src.dmi.denmark",
            "sectionId": "winter_conditions",
            "quote": "Greenland winter: -40°C to -50°C, wind chill -70°C. Exposed skin freezes in 5-10 minutes.",
            "retrievedAt": "2026-01-30T00:00:00Z"
          }
        ],
        "notes": {
          "en": "This is a Layer 1 red line rule. Inadequate cold protection is fatal.",
          "zh": "这是第1层红线规则。寒冷防护不足是致命的。"
        }
      },
      {
        "id": "rule.gl.polar-bear-east-greenland",
        "category": "safety_hazards",
        "severity": "high",
        "appliesTo": {
          "seasons": ["all"],
          "activities": ["hiking", "outdoor", "adventure", "camping"],
          "travelerTags": []
        },
        "when": {
          "any": [
            {
              "containsAny": {
                "path": "itinerary.location",
                "values": ["east-greenland", "northeast-greenland", "remote-areas"]
              }
            },
            {
              "containsAny": {
                "path": "itinerary.activities",
                "values": ["hiking", "outdoor", "adventure", "camping"]
              }
            }
          ]
        },
        "then": {
          "level": "blocker",
          "message": {
            "en": "⚠️ LAYER 1 RED LINE: East Greenland has the highest polar bear concentration in Greenland. Encounter probability 30-50%. Polar bears are not afraid of humans. Spring (Mar-May) is extreme risk season when bears are starving. Mandatory: armed guide, bear spray, satellite communicator, tripwire alarm system for camping. Solo travel = death.",
            "zh": "⚠️ 第1层红线：东格陵兰有格陵兰最高的北极熊集中度。遭遇概率30-50%。北极熊不怕人类。春季（3月-5月）是极端风险季节，熊处于饥饿状态。强制：武装向导、熊喷雾、卫星通讯器、露营地绊线报警系统。独自旅行=死亡。"
          },
          "tasks": [
            {
              "title": {
                "en": "Book expedition ONLY with armed professional guide",
                "zh": "仅与武装专业向导预订远征"
              },
              "dueOffsetDays": -60,
              "tags": ["booking", "safety", "critical"]
            },
            {
              "title": {
                "en": "Acquire bear spray and learn proper use",
                "zh": "获取熊喷雾并学习正确使用"
              },
              "dueOffsetDays": -30,
              "tags": ["gear", "safety"]
            },
            {
              "title": {
                "en": "Carry satellite communicator and personal locator beacon",
                "zh": "携带卫星通讯器和个人定位信标"
              },
              "dueOffsetDays": -14,
              "tags": ["gear", "safety"]
            },
            {
              "title": {
                "en": "Study polar bear encounter protocol and emergency procedures",
                "zh": "学习北极熊遭遇协议和应急程序"
              },
              "dueOffsetDays": -14,
              "tags": ["education", "safety"]
            }
          ],
          "askUser": [
            {
              "en": "Do you understand that East Greenland has extreme polar bear risk?",
              "zh": "您了解东格陵兰有极端北极熊风险吗？"
            },
            {
              "en": "Are you willing to hire an armed guide?",
              "zh": "您愿意雇用武装向导吗？"
            },
            {
              "en": "Have you experienced polar bear encounters before?",
              "zh": "您之前经历过北极熊遭遇吗？"
            }
          ]
        },
        "evidence": [
          {
            "sourceId": "src.iucn.polar",
            "sectionId": "east_greenland_risk",
            "quote": "East Greenland: 200-300 polar bears, encounter probability 30-50%. Extreme risk zone.",
            "retrievedAt": "2026-01-30T00:00:00Z"
          }
        ],
        "notes": {
          "en": "This is a Layer 1 red line rule - violation can be fatal. East Greenland is the most dangerous polar bear zone in Greenland.",
          "zh": "这是第1层红线规则 - 违反可能致命。东格陵兰是格陵兰最危险的北极熊区域。"
        }
      },
      {
        "id": "rule.gl.glacier-crevasse-danger",
        "category": "safety_hazards",
        "severity": "high",
        "appliesTo": {
          "seasons": ["summer", "shoulder"],
          "activities": ["glacier-trekking", "ice-climbing", "ice-sheet-crossing"],
          "travelerTags": []
        },
        "when": {
          "any": [
            {
              "containsAny": {
                "path": "itinerary.activities",
                "values": ["glacier-trekking", "ice-climbing", "ice-sheet-crossing", "ice-cap"]
              }
            }
          ]
        },
        "then": {
          "level": "blocker",
          "message": {
            "en": "⚠️ LAYER 1 RED LINE: Greenland's ice sheet contains hidden crevasses 30-100 meters deep. 90% are covered by snow bridges that collapse without warning. Falling in is fatal. Mandatory: IFMGA certified guide, rope team (minimum 3 people), crampons, ice axe, helmet, avalanche beacon, rescue equipment. Self-guided ice sheet activities are prohibited.",
            "zh": "⚠️ 第1层红线：格陵兰冰盖含有深达30-100米的隐藏裂缝。90%被雪桥覆盖，会在没有警告的情况下崩塌。坠落致命。强制：IFMGA认证向导、绳队（最少3人）、冰爪、冰镐、头盔、雪崩信标、救援装备。禁止自助冰盖活动。"
          },
          "tasks": [
            {
              "title": {
                "en": "Book ice sheet activity ONLY with IFMGA certified guide",
                "zh": "仅与IFMGA认证向导预订冰盖活动"
              },
              "dueOffsetDays": -60,
              "tags": ["booking", "safety", "critical"]
            },
            {
              "title": {
                "en": "Verify complete glacier rescue equipment: rope, pulleys, harness, beacon",
                "zh": "验证完整的冰川救援装备：绳索、滑轮、安全带、信标"
              },
              "dueOffsetDays": -14,
              "tags": ["verification", "safety"]
            },
            {
              "title": {
                "en": "Purchase high-altitude mountain rescue insurance",
                "zh": "购买高山救援保险"
              },
              "dueOffsetDays": -30,
              "tags": ["insurance", "critical"]
            },
            {
              "title": {
                "en": "Complete crevasse rescue training before departure",
                "zh": "出发前完成裂缝救援培训"
              },
              "dueOffsetDays": -30,
              "tags": ["education", "safety"]
            }
          ],
          "askUser": [
            {
              "en": "Have you done ice sheet crossing before?",
              "zh": "您之前做过冰盖穿越吗？"
            },
            {
              "en": "Are you comfortable with crevasse rescue procedures?",
              "zh": "您对裂缝救援程序感到舒适吗？"
            },
            {
              "en": "Do you have high-altitude mountaineering experience?",
              "zh": "您有高山登山经验吗？"
            }
          ]
        },
        "evidence": [
          {
            "sourceId": "src.usgs.greenland",
            "sectionId": "crevasse_hazards",
            "quote": "Greenland ice sheet: crevasses 30-100m deep, 90% hidden under snow. Falling in is fatal.",
            "retrievedAt": "2026-01-30T00:00:00Z"
          }
        ],
        "notes": {
          "en": "This is a Layer 1 red line rule. Self-guided ice sheet activities are prohibited.",
          "zh": "这是第1层红线规则。禁止自助冰盖活动。"
        }
      },
      {
        "id": "rule.gl.whiteout-blizzard",
        "category": "safety_hazards",
        "severity": "high",
        "appliesTo": {
          "seasons": ["all"],
          "activities": ["hiking", "outdoor", "adventure"],
          "travelerTags": []
        },
        "when": {
          "any": [
            {
              "containsAny": {
                "path": "itinerary.activities",
                "values": ["hiking", "outdoor", "adventure", "snowmobile"]
              }
            }
          ]
        },
        "then": {
          "level": "blocker",
          "message": {
            "en": "⚠️ LAYER 1 RED LINE: Greenland whiteout conditions can occur suddenly. Visibility drops to zero. You cannot see sky or ground. Disorientation is instant. Wind speeds 100+ km/h can knock you down. If caught in whiteout: STOP immediately, build shelter, do NOT move. Rescue during whiteout is impossible.",
            "zh": "⚠️ 第1层红线：格陵兰白化条件可能突然发生。能见度降至零。您看不到天空或地面。迷失方向瞬间发生。风速100+公里/小时可将您吹倒。如果陷入白化：立即停止，建造庇护所，不要移动。白化期间救援不可能。"
          },
          "tasks": [
            {
              "title": {
                "en": "Check weather forecast before EVERY outdoor activity",
                "zh": "在每次户外活动前检查天气预报"
              },
              "dueOffsetDays": -1,
              "tags": ["safety", "planning"]
            },
            {
              "title": {
                "en": "Do NOT depart if whiteout warning is issued",
                "zh": "如果发布白化警告，不要出发"
              },
              "dueOffsetDays": -1,
              "tags": ["safety", "critical"]
            },
            {
              "title": {
                "en": "Carry GPS, compass, emergency shelter, and satellite communicator",
                "zh": "携带GPS、指南针、应急庇护所和卫星通讯器"
              },
              "dueOffsetDays": -7,
              "tags": ["gear", "safety"]
            },
            {
              "title": {
                "en": "Learn whiteout survival procedures (stop, shelter, wait)",
                "zh": "学习白化生存程序（停止、庇护、等待）"
              },
              "dueOffsetDays": -7,
              "tags": ["education", "safety"]
            }
          ],
          "askUser": [
            {
              "en": "Do you understand that whiteout can be fatal?",
              "zh": "您了解白化可能致命吗？"
            },
            {
              "en": "Are you willing to cancel activities if weather deteriorates?",
              "zh": "如果天气恶化，您愿意取消活动吗？"
            },
            {
              "en": "Do you have experience in whiteout conditions?",
              "zh": "您有白化条件下的经验吗？"
            }
          ]
        },
        "evidence": [
          {
            "sourceId": "src.dmi.denmark",
            "sectionId": "whiteout_risk",
            "quote": "Whiteout: visibility zero, wind 100+ km/h, disorientation instant. Rescue impossible.",
            "retrievedAt": "2026-01-30T00:00:00Z"
          }
        ],
        "notes": {
          "en": "This is a Layer 1 red line rule. Whiteout conditions are deadly.",
          "zh": "这是第1层红线规则。白化条件是致命的。"
        }
      },
      {
        "id": "rule.gl.arctic-gear-mandatory",
        "category": "gear_packing",
        "severity": "high",
        "appliesTo": {
          "seasons": ["all"],
          "activities": ["hiking", "outdoor", "adventure"],
          "travelerTags": []
        },
        "when": {
          "any": [
            {
              "containsAny": {
                "path": "itinerary.activities",
                "values": ["hiking", "outdoor", "adventure"]
              }
            }
          ]
        },
        "then": {
          "level": "must",
          "message": {
            "en": "Arctic gear is not optional—it is survival equipment. Professional extreme cold gear, multiple headlamps, emergency shelter, and communication devices are mandatory. Regular winter gear is insufficient and can be fatal.",
            "zh": "北极装备不是可选的——它是生存设备。专业极端寒冷装备、多个头灯、应急庇护所和通讯设备是强制性的。普通冬季装备不足以应对，可能致命。"
          },
          "tasks": [
            {
              "title": {
                "en": "Acquire professional Arctic extreme cold gear",
                "zh": "获取专业北极极端寒冷装备"
              },
              "dueOffsetDays": -60,
              "tags": ["gear", "safety"]
            },
            {
              "title": {
                "en": "Pack multiple high-quality headlamps with extra batteries",
                "zh": "打包多个高质量头灯和备用电池"
              },
              "dueOffsetDays": -7,
              "tags": ["gear", "safety"]
            },
            {
              "title": {
                "en": "Pack emergency shelter, GPS, compass, and satellite communicator",
                "zh": "打包应急庇护所、GPS、指南针和卫星通讯器"
              },
              "dueOffsetDays": -7,
              "tags": ["gear", "safety"]
            },
            {
              "title": {
                "en": "Test all gear in cold conditions before departure",
                "zh": "出发前在寒冷条件下测试所有装备"
              },
              "dueOffsetDays": -30,
              "tags": ["verification", "safety"]
            }
          ],
          "askUser": [
            {
              "en": "Do you have professional Arctic extreme cold gear?",
              "zh": "您有专业的北极极端寒冷装备吗？"
            },
            {
              "en": "Have you tested your gear in extreme cold?",
              "zh": "您在极端寒冷中测试过装备吗？"
            }
          ]
        },
        "evidence": [
          {
            "sourceId": "src.dmi.denmark",
            "sectionId": "gear_requirements",
            "quote": "Arctic conditions require professional extreme cold gear. Regular winter gear is insufficient.",
            "retrievedAt": "2026-01-30T00:00:00Z"
          }
        ],
        "notes": {
          "en": "This rule applies to all outdoor activities in Greenland.",
          "zh": "此规则适用于格陵兰的所有户外活动。"
        }
      }
    ],
    "checklists": [
      {
        "id": "chk.gl.iceberg-kayaking-safety",
        "category": "safety_hazards",
        "appliesToSeasons": ["summer", "shoulder"],
        "items": [
          {
            "en": "Understand: Only 10-15% of icebergs are visible above water",
            "zh": "了解：冰山仅10-15%露出水面"
          },
          {
            "en": "Understand: Icebergs can flip suddenly, creating 5-10m waves",
            "zh": "了解：冰山可能突然翻转，产生5-10米的浪"
          },
          {
            "en": "Book kayaking tour ONLY with licensed professional guide",
            "zh": "仅与持证专业向导预订皮划艇旅游"
          },
          {
            "en": "Acquire dry suit (minimum 5mm neoprene) and life jacket",
            "zh": "获取干衣（最少5毫米氯丁橡胶）和救生衣"
          },
          {
            "en": "Verify guide will maintain 500-1000m distance from glacier front",
            "zh": "验证向导将保持距冰川前端500-1000米的距离"
          },
          {
            "en": "Carry satellite communicator and emergency beacon",
            "zh": "携带卫星通讯器和应急信标"
          },
          {
            "en": "Know: Survival time in 2-8°C water is 15-20 minutes without protection",
            "zh": "了解：在2-8°C水中无防护的生存时间为15-20分钟"
          },
          {
            "en": "Never kayak alone or without guide",
            "zh": "永远不要独自皮划艇或没有向导"
          },
          {
            "en": "Inform someone of your kayaking route and expected return time",
            "zh": "告知他人您的皮划艇路线和预计返回时间"
          }
        ]
      },
      {
        "id": "chk.gl.polar-bear-east-greenland",
        "category": "safety_hazards",
        "appliesToSeasons": ["all"],
        "items": [
          {
            "en": "Understand: East Greenland has 200-300 polar bears, encounter probability 30-50%",
            "zh": "了解：东格陵兰有200-300只北极熊，遭遇概率30-50%"
          },
          {
            "en": "Understand: Spring (Mar-May) is extreme risk season (bears starving)",
            "zh": "了解：春季（3月-5月）是极端风险季节（熊处于饥饿状态）"
          },
          {
            "en": "Book expedition ONLY with armed professional guide",
            "zh": "仅与武装专业向导预订远征"
          },
          {
            "en": "Acquire bear spray and learn proper use",
            "zh": "获取熊喷雾并学习正确使用"
          },
          {
            "en": "Carry satellite communicator and personal locator beacon",
            "zh": "携带卫星通讯器和个人定位信标"
          },
          {
            "en": "Study polar bear encounter protocol and emergency procedures",
            "zh": "学习北极熊遭遇协议和应急程序"
          },
          {
            "en": "If camping: set up tripwire alarm system around tent",
            "zh": "如果露营：在帐篷周围设置绊线报警系统"
          },
          {
            "en": "If camping: store food 100+ meters from sleeping area",
            "zh": "如果露营：将食物存放在距睡眠区100米以上的地方"
          },
          {
            "en": "Never travel alone or without armed guide",
            "zh": "永远不要独自旅行或没有武装向导"
          }
        ]
      },
      {
        "id": "chk.gl.glacier-ice-sheet-safety",
        "category": "safety_hazards",
        "appliesToSeasons": ["summer", "shoulder"],
        "items": [
          {
            "en": "Understand: Ice sheet crevasses are 30-100m deep, 90% hidden under snow",
            "zh": "了解：冰盖裂缝深达30-100米，90%隐藏在雪下"
          },
          {
            "en": "Book ice sheet activity ONLY with IFMGA certified guide",
            "zh": "仅与IFMGA认证向导预订冰盖活动"
          },
          {
            "en": "Verify complete glacier rescue equipment: rope, pulleys, harness, beacon",
            "zh": "验证完整的冰川救援装备：绳索、滑轮、安全带、信标"
          },
          {
            "en": "Wear harness and stay roped to guide at all times",
            "zh": "穿着安全带，始终与向导相连"
          },
          {
            "en": "Never step off marked route",
            "zh": "永远不要离开标记的路线"
          },
          {
            "en": "Purchase high-altitude mountain rescue insurance",
            "zh": "购买高山救援保险"
          },
          {
            "en": "Complete crevasse rescue training before departure",
            "zh": "出发前完成裂缝救援培训"
          },
          {
            "en": "Carry extra layers and high-calorie snacks",
            "zh": "携带额外衣物和高热量零食"
          }
        ]
      },
      {
        "id": "chk.gl.whiteout-blizzard",
        "category": "safety_hazards",
        "appliesToSeasons": ["all"],
        "items": [
          {
            "en": "Check weather forecast before EVERY outdoor activity",
            "zh": "在每次户外活动前检查天气预报"
          },
          {
            "en": "Do NOT depart if whiteout warning is issued",
            "zh": "如果发布白化警告，不要出发"
          },
          {
            "en": "Understand: Whiteout = zero visibility, cannot see sky or ground",
            "zh": "了解：白化=零能见度，看不到天空或地面"
          },
          {
            "en": "Understand: Wind 100+ km/h can knock you down",
            "zh": "了解：风速100+公里/小时可将您吹倒"
          },
          {
            "en": "Carry GPS, compass, emergency shelter",
            "zh": "携带GPS、指南针、应急庇护所"
          },
          {
            "en": "If caught in whiteout: STOP immediately, build shelter, do NOT move",
            "zh": "如果陷入白化：立即停止，建造庇护所，不要移动"
          },
          {
            "en": "Carry satellite communicator for emergency contact",
            "zh": "携带卫星通讯器以便紧急联系"
          },
          {
            "en": "Know: Rescue during whiteout is impossible",
            "zh": "了解：白化期间救援不可能"
          }
        ]
      },
      {
        "id": "chk.gl.arctic-extreme-cold-gear",
        "category": "gear_packing",
        "appliesToSeasons": ["all"],
        "items": [
          {
            "en": "Professional Arctic extreme cold parka (NOT regular winter jacket)",
            "zh": "专业北极极端寒冷羽绒服（不是普通冬季夹克）"
          },
          {
            "en": "Extreme cold pants with insulation",
            "zh": "带绝缘的极端寒冷裤"
          },
          {
            "en": "Thermal base layer x4-5 (Merino wool preferred)",
            "zh": "保暖内衣 x4-5（优选美利奴羊毛）"
          },
          {
            "en": "Mid-layer fleece or wool x3-4",
            "zh": "中层抓绒或羊毛 x3-4"
          },
          {
            "en": "Insulated waterproof boots (rated for -40°C)",
            "zh": "绝缘防水靴（-40°C等级）"
          },
          {
            "en": "Thick wool socks x10-12",
            "zh": "厚羊毛袜 x10-12"
          },
          {
            "en": "Insulated gloves or mittens x2-3 pairs",
            "zh": "绝缘手套或连指手套 x2-3副"
          },
          {
            "en": "Balaclava or face mask (covers entire face)",
            "zh": "巴拉克拉法帽或面罩（覆盖整个脸）"
          },
          {
            "en": "Warm hat/beanie",
            "zh": "保暖帽/毛线帽"
          },
          {
            "en": "Neck gaiter or scarf",
            "zh": "颈套或围巾"
          },
          {
            "en": "Sunglasses (UV protection, snow blindness prevention)",
            "zh": "太阳镜（紫外线防护、防雪盲）"
          },
          {
            "en": "Sunscreen SPF 50+ (extreme UV reflection from snow)",
            "zh": "防晒霜SPF 50+（雪的极端紫外线反射）"
          },
          {
            "en": "Lip balm with SPF",
            "zh": "含SPF的唇膏"
          },
          {
            "en": "Hand warmers (chemical heat packs) x15+",
            "zh": "手暖宝宝（化学热包）x15+"
          },
          {
            "en": "Headlamp x3 with extra batteries",
            "zh": "头灯 x3 和备用电池"
          },
          {
            "en": "Emergency shelter/bivvy bag",
            "zh": "应急庇护所/露营袋"
          },
          {
            "en": "First aid kit with frostbite treatment",
            "zh": "急救包，含冻伤处理"
          },
          {
            "en": "Emergency whistle",
            "zh": "应急哨子"
          },
          {
            "en": "GPS device with extra batteries",
            "zh": "GPS设备和备用电池"
          },
          {
            "en": "Compass",
            "zh": "指南针"
          },
          {
            "en": "Satellite communicator (Garmin InReach or similar)",
            "zh": "卫星通讯器（Garmin InReach或类似）"
          },
          {
            "en": "High-calorie emergency food",
            "zh": "高热量应急食物"
          },
          {
            "en": "Thermos for hot drinks",
            "zh": "热饮保温瓶"
          },
          {
            "en": "Dry suit or thick neoprene (if water activities)",
            "zh": "干衣或厚氯丁橡胶（如果水上活动）"
          },
          {
            "en": "Life jacket (if water activities)",
            "zh": "救生衣（如果水上活动）"
          }
        ]
      },
      {
        "id": "chk.gl.summer-specific",
        "category": "gear_packing",
        "appliesToSeasons": ["summer"],
        "items": [
          {
            "en": "Understand: Summer is 24-hour daylight (midnight sun)",
            "zh": "了解：夏季是24小时日光（午夜太阳）"
          },
          {
            "en": "Understand: Temperature still -2 to 5°C, not warm",
            "zh": "了解：温度仍为-2至5°C，不温暖"
          },
          {
            "en": "Understand: Icebergs and glacial melt are major hazards",
            "zh": "了解：冰山和冰川融化是主要危险"
          },
          {
            "en": "Pack waterproof/windproof shell jacket and pants",
            "zh": "打包防水/防风外套和裤子"
          },
          {
            "en": "Pack fleece or wool mid-layer x2-3",
            "zh": "打包抓绒或羊毛中层 x2-3"
          },
          {
            "en": "Pack thermal base layer x2-3",
            "zh": "打包保暖内衣 x2-3"
          },
          {
            "en": "Pack waterproof hiking boots",
            "zh": "打包防水登山靴"
          },
          {
            "en": "Pack high SPF sunscreen (UV reflection from snow/ice)",
            "zh": "打包高SPF防晒霜（雪/冰的紫外线反射）"
          },
          {
            "en": "Pack sunglasses (prevent snow blindness)",
            "zh": "打包太阳镜（防止雪盲）"
          }
        ]
      }
    ],
    "hazards": [
      {
        "type": "water_safety",
        "severity": "high",
        "summary": {
          "en": "Icebergs: only 10-15% visible above water. Can flip suddenly, creating waves 5-10m high. Kayaking near icebergs without guide = extreme risk. Ilulissat Glacier produces 40 billion tons of ice annually.",
          "zh": "冰山：仅10-15%露出水面。可能突然翻转，产生5-10米的浪。在没有向导的情况下在冰山附近皮划艇=极端风险。伊卢利萨特冰川每年产生400亿吨冰。"
        },
        "mitigations": [
          {
            "en": "Book kayaking tour ONLY with licensed professional guide",
            "zh": "仅与持证专业向导预订皮划艇旅游"
          },
          {
            "en": "Acquire dry suit (minimum 5mm neoprene) and life jacket",
            "zh": "获取干衣（最少5毫米氯丁橡胶）和救生衣"
          },
          {
            "en": "Maintain 500-1000m distance from glacier front",
            "zh": "保持距冰川前端500-1000米的距离"
          },
          {
            "en": "Carry satellite communicator and emergency beacon",
            "zh": "携带卫星通讯器和应急信标"
          },
          {
            "en": "Never kayak alone or without guide",
            "zh": "永远不要独自皮划艇或没有向导"
          }
        ]
      },
      {
        "type": "weather_extreme",
        "severity": "high",
        "summary": {
          "en": "Winter temperatures -40°C to -50°C (wind chill -70°C). Exposed skin freezes in 5-10 minutes. Hypothermia is fatal. Inadequate gear = death.",
          "zh": "冬季温度-40°C至-50°C（风寒-70°C）。暴露皮肤5-10分钟内冻伤。失温致命。装备不足=死亡。"
        },
        "mitigations": [
          {
            "en": "Acquire professional Arctic extreme cold gear",
            "zh": "获取专业北极极端寒冷装备"
          },
          {
            "en": "Test all gear in extreme cold conditions before departure",
            "zh": "出发前在极端寒冷条件下测试所有装备"
          },
          {
            "en": "Limit outdoor exposure time in extreme cold",
            "zh": "限制极端寒冷中的户外暴露时间"
          },
          {
            "en": "Carry emergency shelter and heat sources",
            "zh": "携带应急庇护所和热源"
          },
          {
            "en": "Monitor body for frostbite signs",
            "zh": "监测身体冻伤迹象"
          }
        ]
      },
      {
        "type": "wildlife",
        "severity": "high",
        "summary": {
          "en": "East Greenland: 200-300 polar bears, encounter probability 30-50%. Spring (Mar-May) is extreme risk season. Polar bears are not afraid of humans.",
          "zh": "东格陵兰：200-300只北极熊，遭遇概率30-50%。春季（3月-5月）是极端风险季节。北极熊不怕人类。"
        },
        "mitigations": [
          {
            "en": "Book expedition ONLY with armed professional guide",
            "zh": "仅与武装专业向导预订远征"
          },
          {
            "en": "Acquire bear spray and learn proper use",
            "zh": "获取熊喷雾并学习正确使用"
          },
          {
            "en": "Carry satellite communicator and personal locator beacon",
            "zh": "携带卫星通讯器和个人定位信标"
          },
          {
            "en": "If camping: tripwire alarm system, 24-hour watch, food 100m away",
            "zh": "如果露营：绊线报警、24小时守夜、食物100米外"
          },
          {
            "en": "Never travel alone or without armed guide",
            "zh": "永远不要独自旅行或没有武装向导"
          }
        ]
      },
      {
        "type": "terrain",
        "severity": "high",
        "summary": {
          "en": "Ice sheet crevasses: 30-100m deep, 90% hidden under snow. Falling in is fatal. Mandatory: IFMGA certified guide, rope team, crampons, ice axe, helmet, beacon.",
          "zh": "冰盖裂缝：深达30-100米，90%隐藏在雪下。坠落致命。强制：IFMGA认证向导、绳队、冰爪、冰镐、头盔、信标。"
        },
        "mitigations": [
          {
            "en": "Book ice sheet activity ONLY with IFMGA certified guide",
            "zh": "仅与IFMGA认证向导预订冰盖活动"
          },
          {
            "en": "Wear harness and stay roped to guide at all times",
            "zh": "穿着安全带，始终与向导相连"
          },
          {
            "en": "Never step off marked route",
            "zh": "永远不要离开标记的路线"
          },
          {
            "en": "Carry avalanche beacon, probe, shovel",
            "zh": "携带雪崩信标、探针、铲子"
          },
          {
            "en": "Purchase high-altitude mountain rescue insurance",
            "zh": "购买高山救援保险"
          }
        ]
      },
      {
        "type": "weather_extreme",
        "severity": "high",
        "summary": {
          "en": "Whiteout conditions: visibility zero, cannot see sky or ground. Wind 100+ km/h can knock you down. Disorientation is instant. Rescue during whiteout is impossible.",
          "zh": "白化条件：能见度为零，看不到天空或地面。风速100+公里/小时可将您吹倒。迷失方向瞬间发生。白化期间救援不可能。"
        },
        "mitigations": [
          {
            "en": "Check weather forecast before EVERY outdoor activity",
            "zh": "在每次户外活动前检查天气预报"
          },
          {
            "en": "Do NOT depart if whiteout warning is issued",
            "zh": "如果发布白化警告，不要出发"
          },
          {
            "en": "If caught in whiteout: STOP immediately, build shelter, do NOT move",
            "zh": "如果陷入白化：立即停止，建造庇护所，不要移动"
          },
          {
            "en": "Carry GPS, compass, emergency shelter, satellite communicator",
            "zh": "携带GPS、指南针、应急庇护所、卫星通讯器"
          },
          {
            "en": "Never try to navigate in whiteout conditions",
            "zh": "永远不要尝试在白化条件下导航"
          }
        ]
      }
    ],
    "packing": {
      "packingTemplate": {
        "version": "1.0.0",
        "lastUpdated": "2026-01-30T00:00:00.000Z",
        "data": {
          "metadata": {
            "version": "1.0.0",
            "last_updated": "2026-01-30",
            "data_sources": [
              "Danish Meteorological Institute",
              "USGS Greenland Ice Sheet Project",
              "Visit Greenland"
            ]
          },
          "quick_checklist_summer": {
            "description": "Summer Quick Checklist (Jun-Aug)",
            "description_zh": "夏季快速清单（6月-8月）",
            "bestFor": "Summer travel with 24-hour daylight but still Arctic conditions",
            "bestFor_zh": "夏季旅行，24小时日光但仍是北极条件",
            "estimatedItems": "70-80 items",
            "items": [
              "Professional Arctic parka (still needed in summer)",
              "Waterproof/windproof shell jacket and pants",
              "Fleece or wool mid-layer x2-3",
              "Thermal base layer x2-3",
              "Waterproof hiking boots",
              "Wool socks x8-10",
              "Insulated gloves or mittens",
              "Warm hat/beanie",
              "Neck gaiter or scarf",
              "Sunglasses (UV protection)",
              "Sunscreen SPF 50+",
              "Lip balm with SPF",
              "Headlamp with spare batteries",
              "Emergency shelter/bivvy bag",
              "First aid kit",
              "Emergency whistle",
              "GPS device with extra batteries",
              "Compass",
              "Satellite communicator",
              "High-calorie emergency food",
              "Thermos for hot drinks",
              "Dry suit or thick neoprene (if kayaking)",
              "Life jacket (if water activities)",
              "Crampons and ice axe (if glacier activities)",
              "Avalanche beacon, probe, shovel (if ice sheet)",
              "Bear spray (if East Greenland)",
              "Underwear x6-8",
              "Toiletries",
              "Medications",
              "Phone charger with power bank",
              "Camera with extra batteries",
              "Backpack (50-60L)",
              "Water bottle (2L, insulated)",
              "Snacks and energy bars"
            ],
            "whatMustNotSkip": [
              "Professional Arctic parka",
              "Waterproof hiking boots",
              "Headlamp and spare batteries",
              "Emergency shelter",
              "First aid kit",
              "Satellite communicator",
              "Dry suit (if kayaking)",
              "Life jacket (if kayaking)"
            ],
            "criticalReminders": [
              "Even in summer, prepare for cold and rain",
              "Weather can change rapidly",
              "Wind chill makes it feel much colder",
              "Icebergs are active in summer",
              "Bring more socks than you think you need"
            ]
          },
          "quick_checklist_winter": {
            "description": "Winter Quick Checklist (Nov-Feb)",
            "description_zh": "冬季快速清单（11月-2月）",
            "bestFor": "Winter travel with extreme cold and polar night",
            "bestFor_zh": "冬季旅行，极端寒冷和极夜",
            "estimatedItems": "120-140 items",
            "items": [
              "Professional Arctic extreme cold parka (mandatory)",
              "Extreme cold pants with insulation",
              "Thermal base layer x5-6",
              "Fleece or wool mid-layer x4-5",
              "Heavy down jacket or parka",
              "Waterproof/windproof shell jacket and pants",
              "Insulated waterproof boots (rated for -40°C)",
              "Wool socks x12-15",
              "Insulated gloves or mittens x3-4 pairs",
              "Balaclava or face mask",
              "Warm hat/beanie",
              "Neck gaiter or scarf",
              "Sunglasses (UV protection, snow blindness prevention)",
              "Sunscreen SPF 50+",
              "Lip balm with SPF",
              "Hand warmers (chemical heat packs) x20+",
              "Headlamp x4 with extra batteries (only 4-5 hours daylight)",
              "Emergency shelter/bivvy bag",
              "First aid kit with frostbite treatment",
              "Emergency whistle",
              "GPS device with extra batteries",
              "Compass",
              "Satellite communicator",
              "High-calorie emergency food",
              "Thermos for hot drinks",
              "Avalanche beacon, probe, shovel",
              "Crampons and ice axe",
              "Bear spray (if East Greenland)",
              "Underwear x8-10",
              "Toiletries",
              "Medications",
              "Phone charger with power bank",
              "Camera with extra batteries",
              "Backpack (50-60L)",
              "Water bottle (2L, insulated)",
              "Snacks and energy bars",
              "Moisturizer (prevent dry skin)",
              "Vitamin D supplement"
            ],
            "whatMustNotSkip": [
              "Professional Arctic extreme cold parka",
              "Extreme cold pants",
              "Insulated waterproof boots (-40°C rated)",
              "Balaclava or face mask",
              "Multiple headlamps and batteries",
              "Emergency shelter",
              "Satellite communicator",
              "Avalanche safety equipment",
              "Bear spray (if East Greenland)"
            ],
            "criticalReminders": [
              "Winter daylight is only 4-5 hours",
              "Must prepare for extreme cold (-40°C)",
              "Whiteout can occur suddenly",
              "Polar night navigation is extremely difficult",
              "Bring more socks and gloves than you think",
              "Batteries drain faster in extreme cold",
              "Frostbite can occur in 5-10 minutes"
            ]
          },
          "pre_departure_final_checklist": {
            "oneDayBefore": [
              "☐ Passport check: Valid? Visa attached? Copies made?",
              "☐ Flight tickets: Printed or screenshot? Offline saved?",
              "☐ Accommodation confirmation: First night address and contact saved?",
              "☐ Weather forecast: Check DMI for next week",
              "☐ Travel insurance: Verify coverage, especially mountain rescue",
              "☐ Polar bear sightings: Check recent reports (if East Greenland)",
              "☐ Iceberg conditions: Check current reports (if kayaking)"
            ],
            "threeHoursBefore": [
              "☐ All devices charged: Phone, power bank, camera batteries, headlamp batteries",
              "☐ Clothing final check: All packed? Tried on?",
              "☐ Documents final check: Passport, driver's license, credit cards?",
              "☐ Critical items in carry-on: Passport, wallet, phone, power bank, satellite communicator"
            ],
            "thirtyMinutesBefore": [
              "☐ Confirm all luggage packed",
              "☐ Confirm critical documents in carry-on",
              "☐ Close all home appliances"
            ],
            "criticalItemsAbsoluteMustHave": [
              "✅ Passport",
              "✅ Driver's license + International Driving Permit",
              "✅ Credit card x2",
              "✅ Travel insurance certificate (mountain rescue mandatory)",
              "✅ Professional Arctic extreme cold parka",
              "✅ Insulated waterproof boots",
              "✅ Headlamp with batteries x4",
              "✅ Emergency shelter",
              "✅ Satellite communicator",
              "✅ Dry suit (if kayaking)",
              "✅ Life jacket (if kayaking)",
              "✅ Bear spray (if East Greenland)"
            ]
          }
        }
      },
      "packingGuide": {
        "version": "1.0.0",
        "lastUpdated": "2026-01-30T00:00:00.000Z",
        "data": {
          "metadata": {
            "version": "1.0.0",
            "last_updated": "2026-01-30"
          },
          "greenland_specific_tips": [
            "Bring more warm layers than you think you need",
            "Wind chill is extreme - waterproof shell is critical",
            "Socks get wet easily - bring 12-15 pairs",
            "Headlamp is essential, especially in winter (only 4-5 hours daylight)",
            "Emergency shelter can save your life",
            "Bring high-calorie snacks for remote areas",
            "Sunscreen is important even in winter (UV reflection from snow/ice)",
            "Bring moisturizer (dry climate and wind)",
            "Lip balm is essential (prevent chapping)",
            "Batteries drain faster in extreme cold - bring extras",
            "Satellite communicator: test before departure",
            "Dry suit: practice wearing before departure (if kayaking)",
            "Bear spray: practice using before departure (if East Greenland)",
            "Crampons and ice axe: practice using before departure (if glacier)"
          ]
        }
      }
    },
    "metadata": {
      "totalRules": 6,
      "totalChecklists": 6,
      "totalHazards": 5,
      "region": "Greenland",
      "countryCode": "GL",
      "timezone": "GMT (UTC+0)",
      "lastUpdated": "2026-01-30T00:00:00Z",
      "dataSource": "TripNARA Knowledge Base",
      "layer1RedLines": 5,
      "layer2Warnings": 1,
      "criticalSafetyItems": [
        "Professional Arctic extreme cold parka",
        "Insulated waterproof boots",
        "Headlamp with spare batteries x4",
        "Emergency shelter",
        "First aid kit",
        "Satellite communicator",
        "Dry suit (if kayaking)",
        "Life jacket (if kayaking)",
        "Bear spray (if East Greenland)"
      ]
    }
  } as ReadinessPack;

  try {
    logInfo('开始导入格陵兰 Pack 数据...');
    
    // 先保存到文件（可选，用于备份）
    const packsDir = join(__dirname, '../src/trips/readiness/data/packs');
    const filePath = join(packsDir, 'pack.gl.greenland.json');
    logInfo(`保存 Pack 到文件: ${filePath}`);
    writeFileSync(filePath, JSON.stringify(greenlandPack, null, 2), 'utf-8');
    logSuccess(`已保存 Pack 文件: ${filePath}`);

    // 导入到数据库
    const result = await importPackFromJson(greenlandPack);
    
    if (result) {
      logSuccess('✅ 格陵兰 Pack 导入成功！');
    } else {
      logError('❌ 格陵兰 Pack 导入失败！');
      process.exit(1);
    }
  } catch (error: any) {
    logError(`导入失败: ${error.message}`);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
