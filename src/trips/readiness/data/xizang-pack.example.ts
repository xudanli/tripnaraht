// src/trips/readiness/data/xizang-pack.example.ts

/**
 * Xizang (Tibet) Readiness Pack - 西藏旅行准备度规则包
 * 
 * 西藏特殊考虑：
 * 1. 高海拔安全（必须）
 * 2. 补给点稀疏（must）
 * 3. 检查站/边防限制（should/must）
 * 4. 山口/垭口跨越风险（冬季/夜间 must）
 * 
 * 数据来源：
 * - OSM POI（保障点、补给点、检查站、山口）
 * - 地理特征（海拔、路况、距离）
 */

import { ReadinessPack } from '../types/readiness-pack.types';

export const xizangPack: ReadinessPack = {
  packId: 'pack.cn.xizang',
  destinationId: 'CN-XIZANG',
  displayName: 'Xizang (Tibet) Travel Readiness',
  version: '1.0.0',
  lastReviewedAt: '2025-01-15T00:00:00Z',
  geo: {
    countryCode: 'CN',
    region: 'Xizang',
    city: 'Multiple',
  },
  supportedSeasons: ['winter', 'summer', 'shoulder'],
  sources: [
    {
      sourceId: 'src.xizang.tourism',
      authority: 'Xizang Tourism Bureau',
      type: 'html',
      title: 'Travel information',
      canonicalUrl: 'https://www.xizang.gov.cn/',
    },
  ],
  hazards: [
    {
      type: 'healthcare_gap',
      severity: 'high',
      summary: 'High altitude sickness risk; sparse medical facilities in remote areas.',
      mitigations: [
        'Acclimatize gradually (D1 light activity, D2 increase intensity).',
        'Carry oxygen and altitude sickness medication.',
        'Know location of nearest hospital/clinic.',
        'Avoid alcohol and stay hydrated.',
      ],
    },
    {
      type: 'logistics_remote',
      severity: 'high',
      summary: 'Sparse fuel and supply points; long distances between services.',
      mitigations: [
        'Plan fuel stops in advance.',
        'Carry extra fuel in remote areas.',
        'Stock up on supplies in major cities.',
        'Check road conditions before long drives.',
      ],
    },
    {
      type: 'regulatory',
      severity: 'medium',
      summary: 'Checkpoints and border restrictions; special permits required for some areas.',
      mitigations: [
        'Carry valid ID and border permits.',
        'Check checkpoint locations and requirements.',
        'Allow buffer time for checkpoint delays.',
        'Respect photography restrictions.',
      ],
    },
    {
      type: 'terrain',
      severity: 'high',
      summary: 'Mountain passes may close in winter; night driving dangerous.',
      mitigations: [
        'Avoid night driving on mountain passes.',
        'Check road conditions before mountain passes.',
        'Carry winter tires and chains (Nov-Mar).',
        'Allow extra time for pass crossings.',
      ],
    },
  ],
  checklists: [
    {
      id: 'chk.xizang.entry',
      category: 'entry_transit',
      appliesToSeasons: ['all'],
      items: [
        'Valid passport and ID card.',
        'Border permit (if required for your route).',
        'Travel insurance covering high altitude.',
        'Keep documents accessible at checkpoints.',
      ],
    },
    {
      id: 'chk.xizang.altitude',
      category: 'health_insurance',
      appliesToSeasons: ['all'],
      items: [
        'Altitude sickness medication (acetazolamide).',
        'Portable oxygen (especially for >4000m areas).',
        'Gradual acclimatization plan (D1 light, D2 increase).',
        'Know location of nearest hospital/clinic.',
        'Avoid alcohol and stay hydrated.',
      ],
    },
    {
      id: 'chk.xizang.supply',
      category: 'logistics',
      appliesToSeasons: ['all'],
      items: [
        'Plan fuel stops in advance (check FUEL POI density).',
        'Carry extra fuel in remote areas.',
        'Stock up on supplies in major cities (Lhasa, Shigatse).',
        'Carry emergency food and water.',
      ],
    },
    {
      id: 'chk.xizang.winter',
      category: 'gear_packing',
      appliesToSeasons: ['winter'],
      items: [
        'Winter tires and chains (Nov-Mar).',
        'Warm layered clothing (windproof outer, insulated mid, thermal base).',
        'Emergency kit (blanket, food, water, flashlight).',
        'Check road conditions before mountain passes.',
        'Avoid night driving on passes.',
      ],
    },
  ],
  rules: [
    /**
     * 规则 1: 高海拔适应（必须）
     * 触发：region 是西藏 or altitude_m >= 3000
     */
    {
      id: 'rule.xizang.altitude_acclimatization',
      category: 'health_insurance',
      severity: 'high',
      appliesTo: {
        seasons: ['all'],
      },
      when: {
        any: [
          { in: { path: 'itinerary.countries', values: ['CN'] } },
          { gte: { path: 'geo.altitude_m', value: 3000 } },
        ],
      },
      then: {
        level: 'must',
        message: '高海拔地区需要逐步适应。第一天轻量活动，第二天再增加强度。',
        tasks: [
          {
            title: '制定高海拔适应计划',
            dueOffsetDays: -7,
            tags: ['health', 'planning'],
          },
          {
            title: '准备海拔病药物（如乙酰唑胺）',
            dueOffsetDays: -14,
            tags: ['health', 'medication'],
          },
          {
            title: '准备便携式氧气（>4000m 区域）',
            dueOffsetDays: -7,
            tags: ['health', 'equipment'],
          },
        ],
        askUser: [
          '是否有高海拔旅行经验？',
          '是否有心血管或呼吸系统疾病？',
        ],
      },
      evidence: [
        {
          sourceId: 'src.xizang.tourism',
          sectionId: 'altitude_sickness',
          quote: '建议在海拔 3000 米以上地区逐步适应，避免剧烈活动。',
        },
      ],
    },
    
    /**
     * 规则 2: 长距离补给稀疏（must）
     * 触发：两段路程距离长 + 沿途 FUEL 密度低
     */
    {
      id: 'rule.xizang.sparse_supply',
      category: 'logistics',
      severity: 'high',
      appliesTo: {
        seasons: ['all'],
      },
      when: {
        all: [
          { exists: 'geo.fuelDensity' },
          { lt: { path: 'geo.fuelDensity', value: 0.5 } }, // 每 100km 少于 0.5 个加油站
        ],
      },
      then: {
        level: 'must',
        message: '沿途补给点稀疏。必须提前规划燃料和物资补给。',
        tasks: [
          {
            title: '规划燃料补给点',
            dueOffsetDays: -7,
            tags: ['logistics', 'planning'],
          },
          {
            title: '在主要城市（拉萨、日喀则）储备物资',
            dueOffsetDays: -1,
            tags: ['logistics', 'supply'],
          },
          {
            title: '准备备用燃料（偏远地区）',
            dueOffsetDays: -3,
            tags: ['logistics', 'equipment'],
          },
        ],
      },
      evidence: [
        {
          sourceId: 'src.xizang.tourism',
          sectionId: 'logistics',
          quote: '西藏偏远地区补给点稀疏，建议在主要城市提前储备。',
        },
      ],
    },
    
    /**
     * 规则 3: 检查站/边境敏感区域提醒（should/must）
     * 触发：命中 police/名称含"检查站/边防"
     */
    {
      id: 'rule.xizang.checkpoint',
      category: 'entry_transit',
      severity: 'medium',
      appliesTo: {
        seasons: ['all'],
      },
      when: {
        any: [
          { exists: 'geo.checkpointCount' },
          { containsAny: { path: 'geo.poiNames', values: ['检查站', '边防', '边检'] } },
        ],
      },
      then: {
        level: 'should',
        message: '行程经过检查站/边防区域。请准备证件和边防证，预留缓冲时间。',
        tasks: [
          {
            title: '准备边防证（如需要）',
            dueOffsetDays: -14,
            tags: ['entry', 'documents'],
          },
          {
            title: '检查证件有效期',
            dueOffsetDays: -7,
            tags: ['entry', 'documents'],
          },
        ],
        askUser: [
          '是否需要边防证？',
          '是否了解拍照限制？',
        ],
      },
      evidence: [
        {
          sourceId: 'src.xizang.tourism',
          sectionId: 'checkpoints',
          quote: '部分区域需要边防证，请提前办理。',
        },
      ],
    },
    
    /**
     * 规则 4: 山口/垭口跨越风险（冬季/夜间 must）
     * 触发：路线命中 mountain_pass 或山地覆盖高 + 夜间长转场
     */
    {
      id: 'rule.xizang.mountain_pass',
      category: 'safety_hazards',
      severity: 'high',
      appliesTo: {
        seasons: ['winter'],
      },
      when: {
        all: [
          { exists: 'geo.mountainPassCount' },
          { gte: { path: 'geo.mountainPassCount', value: 1 } },
          { in: { path: 'trip.season', values: ['winter'] } },
        ],
      },
      then: {
        level: 'must',
        message: '冬季山口/垭口可能封闭或危险。避免夜间行驶，提前查询路况。',
        tasks: [
          {
            title: '查询山口路况和封路信息',
            dueOffsetDays: -1,
            tags: ['safety', 'road_conditions'],
          },
          {
            title: '准备防滑链和冬季轮胎',
            dueOffsetDays: -7,
            tags: ['safety', 'equipment'],
          },
          {
            title: '规划避开夜间行驶',
            dueOffsetDays: -3,
            tags: ['safety', 'planning'],
          },
        ],
      },
      evidence: [
        {
          sourceId: 'src.xizang.tourism',
          sectionId: 'mountain_passes',
          quote: '冬季山口可能因雪封闭，请提前查询路况。',
        },
      ],
    },
    
    /**
     * 规则 5: 氧气点识别（should）
     * 触发：海拔 > 4000m 且附近有氧气点
     */
    {
      id: 'rule.xizang.oxygen_station',
      category: 'health_insurance',
      severity: 'medium',
      appliesTo: {
        seasons: ['all'],
      },
      when: {
        all: [
          { gte: { path: 'geo.altitude_m', value: 4000 } },
          { exists: 'geo.oxygenStationCount' },
          { gte: { path: 'geo.oxygenStationCount', value: 1 } },
        ],
      },
      then: {
        level: 'should',
        message: '高海拔区域（>4000m）建议了解附近氧气点位置。',
        tasks: [
          {
            title: '标记附近氧气点位置',
            dueOffsetDays: -1,
            tags: ['health', 'planning'],
          },
        ],
      },
    },
  ],
};

