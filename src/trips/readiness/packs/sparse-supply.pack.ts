// src/trips/readiness/packs/sparse-supply.pack.ts

/**
 * Sparse Supply Pack - 补给稀疏能力包
 * 
 * 适用于：路线段距离长 + 沿途 FUEL/SUPPLY 密度低
 * 输出：强制加油点/补给点插入、离线地图、备用水食
 */

import { SparseSupplyPackConfig } from '../types/capability-pack.types';

export const sparseSupplyPack: SparseSupplyPackConfig = {
  type: 'sparse_supply',
  displayName: 'Sparse Supply Area Readiness',
  trigger: {
    all: [
      {
        geoPath: 'geo.roads.roadDensityScore',
        operator: 'lt',
        value: 0.3, // 道路密度低
      },
      {
        geoPath: 'geo.pois.supplyDensity',
        operator: 'lt',
        value: 0.2, // 补给点密度低
      },
      {
        contextPath: 'itinerary.routeLength',
        operator: 'gt',
        value: 100, // 路线长度 > 100km
      },
    ],
  },
  metadata: {
    description: '适用于补给稀疏的长距离路线',
    priority: 2,
  },
  hazards: [
    {
      type: 'supply_shortage',
      severity: 'medium',
      summary: '补给点稀少，可能导致燃料、食物、水短缺',
      mitigations: [
        '提前规划加油点和补给点',
        '携带额外燃料和食物',
        '下载离线地图',
        '准备应急通信设备',
      ],
    },
  ],
  rules: [
    {
      id: 'rule.supply.fuel.planning',
      category: 'logistics',
      severity: 'high',
      appliesTo: {
        activities: ['self_drive', 'road_trip'],
      },
      when: {
        all: [
          {
            geoPath: 'geo.pois.supply.hasFuel',
            operator: 'eq',
            value: false,
          },
          {
            contextPath: 'itinerary.routeLength',
            operator: 'gt',
            value: 200,
          },
        ],
      },
      then: {
        level: 'must',
        message: '路线长且沿途加油站稀少。必须提前规划强制加油点，避免燃料耗尽。',
        tasks: [
          {
            title: '规划强制加油点（每 150-200km）',
            dueOffsetDays: -14,
            tags: ['logistics', 'fuel'],
          },
          {
            title: '确认加油站营业时间和可用性',
            dueOffsetDays: -7,
            tags: ['logistics', 'fuel'],
          },
          {
            title: '准备备用燃料（如便携油桶）',
            dueOffsetDays: -3,
            tags: ['gear', 'fuel'],
          },
        ],
        askUser: [
          '是否已规划强制加油点？',
          '是否已确认加油站可用性？',
          '是否已准备备用燃料？',
        ],
      },
      notes: '长距离 + 无加油站 = 高风险',
    },
    {
      id: 'rule.supply.food.water',
      category: 'gear_packing',
      severity: 'medium',
      when: {
        all: [
          {
            geoPath: 'geo.pois.supply.hasSupermarket',
            operator: 'eq',
            value: false,
          },
          {
            contextPath: 'itinerary.routeLength',
            operator: 'gt',
            value: 150,
          },
        ],
      },
      then: {
        level: 'should',
        message: '沿途补给点稀少。建议携带额外食物和水，避免补给不足。',
        tasks: [
          {
            title: '准备额外食物（至少 2-3 天量）',
            dueOffsetDays: -3,
            tags: ['gear', 'supply'],
          },
          {
            title: '准备充足饮用水（每人每天 3-4L）',
            dueOffsetDays: -3,
            tags: ['gear', 'water'],
          },
          {
            title: '准备水净化设备（如过滤器）',
            dueOffsetDays: -7,
            tags: ['gear', 'water'],
          },
        ],
        askUser: [
          '是否已准备额外食物和水？',
          '是否已准备水净化设备？',
        ],
      },
      notes: '补给稀疏地区建议自备充足补给',
    },
    {
      id: 'rule.supply.offline.map',
      category: 'logistics',
      severity: 'high',
      when: {
        all: [
          {
            geoPath: 'geo.roads.roadDensityScore',
            operator: 'lt',
            value: 0.3,
          },
        ],
      },
      then: {
        level: 'must',
        message: '偏远地区网络信号可能不稳定。必须下载离线地图，避免迷路。',
        tasks: [
          {
            title: '下载离线地图（Google Maps、Maps.me 等）',
            dueOffsetDays: -3,
            tags: ['navigation', 'offline'],
          },
          {
            title: '准备纸质地图作为备份',
            dueOffsetDays: -7,
            tags: ['navigation', 'backup'],
          },
          {
            title: '测试离线导航功能',
            dueOffsetDays: -1,
            tags: ['navigation', 'test'],
          },
        ],
        askUser: [
          '是否已下载离线地图？',
          '是否已准备纸质地图？',
        ],
      },
      notes: '偏远地区必须准备离线导航',
    },
    {
      id: 'rule.supply.communication',
      category: 'safety_hazards',
      severity: 'medium',
      when: {
        all: [
          {
            geoPath: 'geo.roads.roadDensityScore',
            operator: 'lt',
            value: 0.2,
          },
        ],
      },
      then: {
        level: 'should',
        message: '偏远地区通信信号可能不稳定。建议准备卫星通信设备或应急信标。',
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
      notes: '极偏远地区建议准备卫星通信',
    },
  ],
};

