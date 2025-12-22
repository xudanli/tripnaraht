// src/trips/readiness/packs/seasonal-road.pack.ts

/**
 * Seasonal Road Pack - 季节性封路/山口能力包
 * 
 * 适用于：命中 mountain_pass 或 山地覆盖高 + 冬季月份
 * 输出：避免夜行、加 buffer、提示查封路/胎链
 */

import { SeasonalRoadPackConfig } from '../types/capability-pack.types';

export const seasonalRoadPack: SeasonalRoadPackConfig = {
  type: 'seasonal_road',
  displayName: 'Seasonal Road Closure Readiness',
  trigger: {
    all: [
      {
        geoPath: 'geo.mountains.inMountain',
        operator: 'eq',
        value: true,
      },
      {
        contextPath: 'itinerary.season',
        operator: 'in',
        value: ['winter'],
      },
    ],
  },
  metadata: {
    description: '适用于冬季山地/山口路线',
    priority: 1,
  },
  hazards: [
    {
      type: 'road_closure',
      severity: 'high',
      summary: '冬季山口可能封闭，道路结冰，通行困难',
      mitigations: [
        '检查山口开放状态',
        '准备冬季轮胎和防滑链',
        '避免夜间行驶',
        '预留额外时间（buffer）',
      ],
    },
  ],
  rules: [
    {
      id: 'rule.seasonal.mountain.pass',
      category: 'safety_hazards',
      severity: 'high',
      appliesTo: {
        activities: ['self_drive', 'road_trip'],
      },
      when: {
        all: [
          {
            geoPath: 'geo.roads.hasMountainPass',
            operator: 'eq',
            value: true,
          },
          {
            contextPath: 'itinerary.season',
            operator: 'in',
            value: ['winter'],
          },
        ],
      },
      then: {
        level: 'must',
        message: '冬季山口可能封闭或通行困难。必须检查开放状态，准备冬季装备，避免夜间行驶。',
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
          {
            title: '预留额外时间（buffer，至少 2-3 小时）',
            dueOffsetDays: -1,
            tags: ['planning', 'buffer'],
          },
        ],
        askUser: [
          '是否已确认山口开放状态？',
          '是否已准备冬季轮胎和防滑链？',
          '是否已规划备选路线？',
        ],
      },
      notes: '冬季山口 = 高风险',
    },
    {
      id: 'rule.seasonal.night.driving',
      category: 'safety_hazards',
      severity: 'high',
      appliesTo: {
        activities: ['self_drive', 'road_trip'],
      },
      when: {
        all: [
          {
            geoPath: 'geo.mountains.inMountain',
            operator: 'eq',
            value: true,
          },
          {
            contextPath: 'itinerary.season',
            operator: 'in',
            value: ['winter'],
          },
        ],
      },
      then: {
        level: 'must',
        message: '冬季山地夜间行驶风险极高。必须避免夜间行驶，确保在天黑前到达目的地。',
        tasks: [
          {
            title: '规划行程，确保天黑前到达',
            dueOffsetDays: -3,
            tags: ['planning', 'safety'],
          },
          {
            title: '预留额外时间（避免延误导致夜间行驶）',
            dueOffsetDays: -1,
            tags: ['planning', 'buffer'],
          },
        ],
        askUser: [
          '是否已规划避免夜间行驶？',
          '是否已预留额外时间？',
        ],
      },
      notes: '冬季山地 + 夜间 = 极高风险',
    },
    {
      id: 'rule.seasonal.buffer.time',
      category: 'logistics',
      severity: 'medium',
      appliesTo: {
        activities: ['self_drive', 'road_trip'],
      },
      when: {
        all: [
          {
            geoPath: 'geo.mountains.inMountain',
            operator: 'eq',
            value: true,
          },
          {
            contextPath: 'itinerary.season',
            operator: 'in',
            value: ['winter'],
          },
        ],
      },
      then: {
        level: 'should',
        message: '冬季山地路线需要额外时间。建议预留至少 2-3 小时 buffer，应对封路、慢行等情况。',
        tasks: [
          {
            title: '预留额外时间（至少 2-3 小时）',
            dueOffsetDays: -1,
            tags: ['planning', 'buffer'],
          },
          {
            title: '准备备选住宿（如遇封路）',
            dueOffsetDays: -3,
            tags: ['accommodation', 'backup'],
          },
        ],
        askUser: [
          '是否已预留额外时间？',
          '是否已准备备选住宿？',
        ],
      },
      notes: '冬季山地需要更多时间',
    },
    {
      id: 'rule.seasonal.tire.chains',
      category: 'gear_packing',
      severity: 'high',
      appliesTo: {
        activities: ['self_drive', 'road_trip'],
      },
      when: {
        all: [
          {
            geoPath: 'geo.mountains.inMountain',
            operator: 'eq',
            value: true,
          },
          {
            contextPath: 'itinerary.season',
            operator: 'in',
            value: ['winter'],
          },
        ],
      },
      then: {
        level: 'must',
        message: '冬季山地必须使用冬季轮胎，部分路段可能需要防滑链。',
        tasks: [
          {
            title: '确认车辆配备冬季轮胎（11-4 月）',
            dueOffsetDays: -7,
            tags: ['gear', 'tires'],
          },
          {
            title: '准备防滑链（应对极端情况）',
            dueOffsetDays: -7,
            tags: ['gear', 'chains'],
          },
          {
            title: '学习防滑链安装方法',
            dueOffsetDays: -3,
            tags: ['gear', 'knowledge'],
          },
        ],
        askUser: [
          '车辆是否配备冬季轮胎？',
          '是否已准备防滑链？',
          '是否已学会安装防滑链？',
        ],
      },
      notes: '冬季山地必须准备冬季轮胎和防滑链',
    },
  ],
};

