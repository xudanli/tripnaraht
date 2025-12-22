// src/trips/readiness/data/norway-pack.example.ts

/**
 * Norway Readiness Pack - 挪威旅行准备度规则包
 * 
 * 包含挪威特有的 Readiness 规则：
 * 1. 渡轮依赖日（FERRY_TERMINAL 命中 + 路线跨海）
 * 2. 冬季山口自驾（日程含山地 + 月份 11–3）
 * 3. 极北极光活动（Tromsø/Lofoten/North Cape）
 * 4. 徒步入口（trailhead/cabin 命中）
 */

import { ReadinessPack } from '../types/readiness-pack.types';

export const norwayPack: ReadinessPack = {
  packId: 'pack.no.norway',
  destinationId: 'NO-NORWAY',
  displayName: 'Norway Travel Readiness',
  version: '1.0.0',
  lastReviewedAt: '2025-12-21T00:00:00Z',
  geo: {
    countryCode: 'NO',
    region: 'Norway',
    city: 'Multiple',
  },
  supportedSeasons: ['winter', 'summer', 'shoulder'],
  sources: [
    {
      sourceId: 'src.visit.norway',
      authority: 'Visit Norway',
      type: 'html',
      title: 'Travel information',
      canonicalUrl: 'https://www.visitnorway.com/',
    },
    {
      sourceId: 'src.vegvesen',
      authority: 'Statens vegvesen',
      type: 'html',
      title: 'Road conditions and winter driving',
      canonicalUrl: 'https://www.vegvesen.no/',
    },
  ],
  hazards: [
    {
      type: 'weather_extreme',
      severity: 'high',
      summary: 'Winter mountain passes may close; ferry schedules can be disrupted by weather.',
      mitigations: [
        'Check road conditions before mountain passes (especially Trollstigen, Atlantic Road).',
        'Build buffer days for ferry-dependent routes.',
        'Carry winter tires and chains for mountain driving (Nov-Mar).',
      ],
    },
    {
      type: 'logistics_remote',
      severity: 'medium',
      summary: 'Northern regions have limited services; ferry-dependent routes require planning.',
      mitigations: [
        'Book ferry tickets in advance during peak season.',
        'Have backup plans for ferry cancellations.',
        'Carry extra fuel in remote areas.',
      ],
    },
  ],
  checklists: [
    {
      id: 'chk.no.entry',
      category: 'entry_transit',
      appliesToSeasons: ['all'],
      items: [
        'Check Schengen visa requirements if applicable.',
        'Carry valid passport (Norway is in Schengen but not EU).',
        'Keep travel insurance documents accessible.',
      ],
    },
    {
      id: 'chk.no.winter.driving',
      category: 'gear_packing',
      appliesToSeasons: ['winter'],
      items: [
        'Winter tires (mandatory Nov-Apr in many regions).',
        'Snow chains for mountain passes.',
        'Emergency kit (blanket, food, water, flashlight).',
        'Check road conditions before mountain passes.',
      ],
    },
    {
      id: 'chk.no.aurora',
      category: 'gear_packing',
      appliesToSeasons: ['winter'],
      items: [
        'Warm layered clothing (windproof outer, insulated mid, thermal base).',
        'Camera with tripod and spare batteries (cold drains batteries).',
        'Headlamp for aurora viewing.',
        'Hand warmers.',
      ],
    },
  ],
  rules: [
    /**
     * 规则 1: 渡轮依赖日
     * 当路线包含渡轮码头且路线跨海时触发
     */
    {
      id: 'rule.no.ferry.dependent',
      category: 'logistics',
      severity: 'high',
      appliesTo: {
        activities: ['self_drive', 'road_trip', 'island_hopping'],
      },
      when: {
        all: [
          { exists: 'geo.pois.topPickupPoints' },
          {
            // 检查是否有渡轮码头（通过 POI 特征）
            // 注意：这需要在 enhanceContext 中添加 geo 字段
            containsAny: {
              path: 'geo.pois.topPickupPoints',
              values: ['FERRY_TERMINAL', 'PIER_DOCK'],
            },
          },
          {
            // 路线跨海（简化判断：如果有多个渡轮码头或路线包含岛屿）
            eq: { path: 'itinerary.hasSeaCrossing', value: true },
          },
        ],
      },
      then: {
        level: 'must',
        message:
          '路线依赖渡轮，需预留排队时间并准备备选方案。渡轮班次可能因天气取消，建议预留缓冲时间。',
        tasks: [
          {
            title: '查询渡轮时刻表和预订信息',
            dueOffsetDays: -14,
            tags: ['ferry', 'booking'],
          },
          {
            title: '准备备选码头和备选时段',
            dueOffsetDays: -7,
            tags: ['ferry', 'backup'],
          },
          {
            title: '确认渡轮运营状态（出发前）',
            dueOffsetDays: -1,
            tags: ['ferry', 'check'],
          },
        ],
        askUser: [
          '路线是否包含跨海段？',
          '是否已预订渡轮票？',
          '是否有备选路线？',
        ],
      },
      evidence: [
        {
          sourceId: 'src.visit.norway',
          sectionId: 'ferry',
          quote: 'Ferry schedules can be affected by weather conditions.',
        },
      ],
      notes: '基于 POI 数据中的 FERRY_TERMINAL 和 PIER_DOCK 分类判断',
    },

    /**
     * 规则 2: 冬季山口自驾
     * 当日程含山地且月份为 11-3 时触发
     */
    {
      id: 'rule.no.winter.mountain.pass',
      category: 'safety_hazards',
      severity: 'high',
      appliesTo: {
        seasons: ['winter'],
        activities: ['self_drive', 'road_trip'],
      },
      when: {
        all: [
          {
            // 检查是否在山地（通过地理特征）
            eq: { path: 'geo.mountains.inMountain', value: true },
          },
          {
            // 月份在 11-3（冬季）
            in: {
              path: 'itinerary.month',
              values: [11, 12, 1, 2, 3],
            },
          },
          {
            // 包含自驾活动
            containsAny: {
              path: 'itinerary.activities',
              values: ['self_drive', 'road_trip'],
            },
          },
        ],
      },
      then: {
        level: 'must',
        message:
          '冬季山口自驾风险高，部分山口（如 Trollstigen）可能封闭。必须加 buffer、避免夜间长转场，并准备雪胎/防滑链。',
        tasks: [
          {
            title: '检查山口开放状态（出发前）',
            dueOffsetDays: -1,
            tags: ['safety', 'road_conditions'],
          },
          {
            title: '准备冬季轮胎和防滑链',
            dueOffsetDays: -7,
            tags: ['gear', 'safety'],
          },
          {
            title: '规划备选路线（避免封闭山口）',
            dueOffsetDays: -3,
            tags: ['route', 'backup'],
          },
        ],
        askUser: [
          '是否已确认山口开放状态？',
          '车辆是否配备冬季轮胎？',
          '是否有备选路线？',
        ],
      },
      evidence: [
        {
          sourceId: 'src.vegvesen',
          sectionId: 'winter_driving',
          quote: 'Mountain passes may close during winter; check conditions before travel.',
        },
      ],
      notes: '基于地理特征中的 mountains.inMountain 和月份判断',
    },

    /**
     * 规则 3: 极北极光活动
     * 当在极北地区（Tromsø/Lofoten/North Cape）且为冬季时触发
     */
    {
      id: 'rule.no.aurora.activity',
      category: 'gear_packing',
      severity: 'medium',
      appliesTo: {
        seasons: ['winter'],
        activities: ['aurora', 'northern_lights', 'photography'],
      },
      when: {
        all: [
          {
            // 检查是否在极北地区（通过区域标识或纬度）
            any: [
              { eq: { path: 'itinerary.region', value: 'Tromsø' } },
              { eq: { path: 'itinerary.region', value: 'Lofoten' } },
              { eq: { path: 'itinerary.region', value: 'North Cape' } },
              {
                // 纬度 > 69（极北）
                eq: { path: 'geo.latitude', value: { $gt: 69 } },
              },
            ],
          },
          {
            // 冬季
            in: {
              path: 'itinerary.season',
              values: ['winter'],
            },
          },
          {
            // 包含极光相关活动
            any: [
              { containsAny: { path: 'itinerary.activities', values: ['aurora', 'northern_lights'] } },
              { eq: { path: 'itinerary.hasAuroraActivity', value: true } },
            ],
          },
        ],
      },
      then: {
        level: 'should',
        message:
          '极北地区冬季极光活动：光照短、风大体感低。建议保暖分层、相机防潮、携带备用电池。',
        tasks: [
          {
            title: '准备保暖装备（分层穿着）',
            dueOffsetDays: -7,
            tags: ['gear', 'warmth'],
          },
          {
            title: '准备相机防潮设备和备用电池',
            dueOffsetDays: -3,
            tags: ['gear', 'photography'],
          },
          {
            title: '查询极光预报（出发前）',
            dueOffsetDays: -1,
            tags: ['aurora', 'weather'],
          },
        ],
        askUser: [
          '是否已准备保暖装备？',
          '相机是否已做好防潮准备？',
        ],
      },
      evidence: [
        {
          sourceId: 'src.visit.norway',
          sectionId: 'aurora',
          quote: 'Aurora viewing requires warm clothing and camera protection from cold.',
        },
      ],
      notes: '基于区域标识和季节判断',
    },

    /**
     * 规则 4: 徒步入口
     * 当附近有 trailhead 或 cabin 时触发
     */
    {
      id: 'rule.no.trailhead.access',
      category: 'activities_bookings',
      severity: 'medium',
      appliesTo: {
        activities: ['hiking', 'trekking', 'outdoor'],
      },
      when: {
        all: [
          {
            // 检查是否有徒步入口（通过 POI 特征）
            exists: 'geo.pois.trailAccessPoints',
          },
          {
            // 包含徒步活动
            containsAny: {
              path: 'itinerary.activities',
              values: ['hiking', 'trekking', 'outdoor'],
            },
          },
        ],
      },
      then: {
        level: 'must',
        message:
          '附近有徒步入口点。建议：准备装备、了解路线难度、日落前回程、携带离线地图。',
        tasks: [
          {
            title: '查询路线难度和所需装备',
            dueOffsetDays: -7,
            tags: ['hiking', 'gear'],
          },
          {
            title: '下载离线地图',
            dueOffsetDays: -3,
            tags: ['hiking', 'navigation'],
          },
          {
            title: '确认徒步入口位置和停车点',
            dueOffsetDays: -1,
            tags: ['hiking', 'logistics'],
          },
        ],
        askUser: [
          '是否已了解路线难度？',
          '是否已准备离线地图？',
          '是否已确认入口位置？',
        ],
      },
      evidence: [
        {
          sourceId: 'src.visit.norway',
          sectionId: 'hiking',
          quote: 'Always inform someone of your hiking plans and carry appropriate gear.',
        },
      ],
      notes: '基于 POI 数据中的 TRAILHEAD 和 CABIN 分类判断',
    },

    /**
     * 规则 5: 充电桩可用性（电动车自驾）
     * 当使用电动车自驾时触发
     */
    {
      id: 'rule.no.ev.charging',
      category: 'logistics',
      severity: 'medium',
      appliesTo: {
        activities: ['self_drive', 'road_trip'],
      },
      when: {
        all: [
          {
            // 使用电动车
            eq: { path: 'itinerary.vehicleType', value: 'electric' },
          },
          {
            // 检查是否有充电桩（通过 POI 特征）
            eq: { path: 'geo.pois.hasEVCharger', value: true },
          },
        ],
      },
      then: {
        level: 'should',
        message:
          '路线包含充电桩，但建议提前规划充电站位置，避免在偏远地区电量耗尽。',
        tasks: [
          {
            title: '规划充电站位置',
            dueOffsetDays: -7,
            tags: ['ev', 'planning'],
          },
          {
            title: '确认充电站可用性（出发前）',
            dueOffsetDays: -1,
            tags: ['ev', 'check'],
          },
        ],
        askUser: [
          '是否已规划充电站位置？',
          '是否已确认充电站可用性？',
        ],
      },
      notes: '基于 POI 数据中的 EV_CHARGER 分类判断',
    },

    /**
     * 规则 6: 极地夜/极地日（挪威北部特有）
     * 当在极北地区且为极地夜/极地日时触发
     */
    {
      id: 'rule.no.polar.night.day',
      category: 'gear_packing',
      severity: 'medium',
      appliesTo: {
        seasons: ['winter', 'summer'],
      },
      when: {
        all: [
          {
            any: [
              { eq: { path: 'itinerary.region', value: 'Tromsø' } },
              { eq: { path: 'itinerary.region', value: 'Lofoten' } },
              { eq: { path: 'itinerary.region', value: 'North Cape' } },
              {
                eq: { path: 'geo.latitude', value: { $gte: 69 } },
              },
            ],
          },
          {
            in: {
              path: 'itinerary.month',
              values: [11, 12, 1, 2], // 极地夜月份
            },
          },
        ],
      },
      then: {
        level: 'should',
        message:
          '极地夜期间（11-2 月）：几乎全天黑暗，需准备头灯、反光装备，避免夜间户外活动。',
        tasks: [
          {
            title: '准备头灯和反光装备',
            dueOffsetDays: -7,
            tags: ['gear', 'safety'],
          },
          {
            title: '规划活动时间（充分利用白天）',
            dueOffsetDays: -3,
            tags: ['planning'],
          },
        ],
        askUser: [
          '是否已准备头灯和反光装备？',
          '是否已规划活动时间？',
        ],
      },
      notes: '极地夜期间需要特殊准备',
    },

    /**
     * 规则 7: 峡湾路线（挪威特色）
     * 当路线包含峡湾且需要渡轮时触发
     */
    {
      id: 'rule.no.fjord.route',
      category: 'logistics',
      severity: 'medium',
      appliesTo: {
        activities: ['self_drive', 'road_trip'],
      },
      when: {
        all: [
          {
            eq: { path: 'geo.coastlines.isCoastalArea', value: true },
          },
          {
            eq: { path: 'geo.pois.hasFerryTerminal', value: true },
          },
          {
            containsAny: {
              path: 'itinerary.activities',
              values: ['self_drive', 'road_trip'],
            },
          },
        ],
      },
      then: {
        level: 'should',
        message:
          '峡湾路线通常需要渡轮连接。建议提前查询渡轮时刻表，预留排队时间，并准备备选路线。',
        tasks: [
          {
            title: '查询峡湾渡轮时刻表',
            dueOffsetDays: -14,
            tags: ['ferry', 'planning'],
          },
          {
            title: '预留排队时间（旺季可能需 1-2 小时）',
            dueOffsetDays: -7,
            tags: ['planning', 'buffer'],
          },
        ],
        askUser: [
          '是否已查询渡轮时刻表？',
          '是否已预留排队时间？',
        ],
      },
      notes: '峡湾路线依赖渡轮',
    },

    /**
     * 规则 8: 极地野生动物（挪威北部）
     * 当在极北地区进行户外活动时触发
     */
    {
      id: 'rule.no.arctic.wildlife',
      category: 'safety_hazards',
      severity: 'high',
      appliesTo: {
        activities: ['hiking', 'camping', 'outdoor'],
      },
      when: {
        all: [
          {
            any: [
              { eq: { path: 'itinerary.region', value: 'Tromsø' } },
              { eq: { path: 'itinerary.region', value: 'Lofoten' } },
              { eq: { path: 'itinerary.region', value: 'North Cape' } },
              {
                eq: { path: 'geo.latitude', value: { $gte: 69 } },
              },
            ],
          },
          {
            containsAny: {
              path: 'itinerary.activities',
              values: ['hiking', 'camping', 'outdoor'],
            },
          },
        ],
      },
      then: {
        level: 'must',
        message:
          '极北地区可能有野生动物（如驯鹿、北极狐等）。建议了解当地野生动物情况，保持安全距离，避免夜间户外活动。',
        tasks: [
          {
            title: '了解当地野生动物情况',
            dueOffsetDays: -7,
            tags: ['safety', 'wildlife'],
          },
          {
            title: '准备防熊喷雾（如需要）',
            dueOffsetDays: -7,
            tags: ['gear', 'safety'],
          },
          {
            title: '避免夜间户外活动',
            dueOffsetDays: -1,
            tags: ['safety', 'planning'],
          },
        ],
        askUser: [
          '是否已了解当地野生动物情况？',
          '是否已准备安全装备？',
        ],
      },
      notes: '极北地区野生动物安全',
    },

    /**
     * 规则 9: 极地通信（挪威北部）
     * 当在极北偏远地区时触发
     */
    {
      id: 'rule.no.arctic.communication',
      category: 'safety_hazards',
      severity: 'medium',
      when: {
        all: [
          {
            any: [
              { eq: { path: 'itinerary.region', value: 'Tromsø' } },
              { eq: { path: 'itinerary.region', value: 'Lofoten' } },
              { eq: { path: 'itinerary.region', value: 'North Cape' } },
            ],
          },
          {
            eq: { path: 'geo.roads.roadDensityScore', value: { $lt: 0.3 } },
          },
        ],
      },
      then: {
        level: 'should',
        message:
          '极北偏远地区通信信号可能不稳定。建议准备卫星通信设备，并告知他人行程计划。',
        tasks: [
          {
            title: '准备卫星通信设备（如卫星电话、PLB）',
            dueOffsetDays: -7,
            tags: ['safety', 'communication'],
          },
          {
            title: '告知他人行程计划和预计返回时间',
            dueOffsetDays: -1,
            tags: ['safety', 'planning'],
          },
        ],
        askUser: [
          '是否已准备应急通信设备？',
          '是否已告知他人行程计划？',
        ],
      },
      notes: '极北偏远地区通信建议',
    },
  ],
};

