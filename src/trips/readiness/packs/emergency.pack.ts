// src/trips/readiness/packs/emergency.pack.ts

/**
 * Emergency Pack - 应急能力包
 * 
 * 适用于：偏远、海拔高、长距离无人区
 * 输出：最近医院/警局、紧急电话、通信弱提示、保险建议
 */

import { EmergencyPackConfig, CapabilityCondition, CapabilityTrigger } from '../types/capability-pack.types';

export const emergencyPack: EmergencyPackConfig = {
  type: 'emergency',
  displayName: 'Emergency Preparedness Readiness',
  trigger: {
    all: [
      {
        geoPath: 'geo.roads.roadDensityScore',
        operator: 'lt' as const,
        value: 0.2, // 偏远地区
      },
      {
        any: [
          {
            geoPath: 'geo.pois.safety.hasHospital',
            operator: 'eq' as const,
            value: false,
          },
          {
            contextPath: 'itinerary.routeLength',
            operator: 'gt' as const,
            value: 300, // 长距离
          },
          {
            geoPath: 'geo.mountains.mountainElevationAvg',
            operator: 'gte' as const,
            value: 3000, // 高海拔
          },
        ],
      },
    ],
  },
  metadata: {
    description: '适用于偏远、高海拔、长距离无人区',
    priority: 1,
  },
  hazards: [
    {
      type: 'emergency_response',
      severity: 'high',
      summary: '偏远地区应急响应困难，医疗救援可能延迟',
      mitigations: [
        '购买包含救援的保险',
        '了解最近医疗点位置',
        '准备应急通信设备',
        '告知他人行程计划',
      ],
    },
  ],
  rules: [
    {
      id: 'rule.emergency.medical',
      category: 'health_insurance',
      severity: 'high',
      when: {
        all: [
          {
            geoPath: 'geo.pois.safety.hasHospital',
            operator: 'eq',
            value: false,
          },
          {
            geoPath: 'geo.roads.roadDensityScore',
            operator: 'lt',
            value: 0.3,
          },
        ],
      },
      then: {
        level: 'must',
        message: '偏远地区且附近无医院。必须购买包含医疗救援的保险，并了解最近医疗点位置。',
        tasks: [
          {
            title: '购买包含医疗救援的保险',
            dueOffsetDays: -14,
            tags: ['insurance', 'health'],
          },
          {
            title: '查询最近医院/诊所位置',
            dueOffsetDays: -7,
            tags: ['safety', 'medical'],
          },
          {
            title: '准备紧急联系方式',
            dueOffsetDays: -3,
            tags: ['safety', 'emergency'],
          },
        ],
        askUser: [
          '保险是否包含医疗救援？',
          '是否已了解最近医疗点位置？',
          '是否已准备紧急联系方式？',
        ],
      },
      notes: '偏远 + 无医院 = 高风险',
    },
    {
      id: 'rule.emergency.contact',
      category: 'safety_hazards',
      severity: 'high',
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
        level: 'must',
        message: '偏远地区必须准备紧急联系方式，包括当地紧急电话、大使馆电话、保险公司救援电话。',
        tasks: [
          {
            title: '查询当地紧急电话（警察、消防、医疗）',
            dueOffsetDays: -7,
            tags: ['safety', 'emergency'],
          },
          {
            title: '查询大使馆/领事馆联系方式',
            dueOffsetDays: -7,
            tags: ['safety', 'embassy'],
          },
          {
            title: '保存保险公司救援电话',
            dueOffsetDays: -3,
            tags: ['insurance', 'rescue'],
          },
          {
            title: '准备应急联系人信息',
            dueOffsetDays: -1,
            tags: ['safety', 'contact'],
          },
        ],
        askUser: [
          '是否已准备紧急联系方式？',
          '是否已保存大使馆电话？',
          '是否已保存保险公司救援电话？',
        ],
      },
      notes: '偏远地区必须准备紧急联系方式',
    },
    {
      id: 'rule.emergency.communication',
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
        message: '偏远地区通信信号可能不稳定。建议准备卫星通信设备或应急信标，并告知他人行程计划。',
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
          {
            title: '准备应急信标（如 PLB、EPIRB）',
            dueOffsetDays: -7,
            tags: ['safety', 'beacon'],
          },
        ],
        askUser: [
          '是否已准备应急通信设备？',
          '是否已告知他人行程计划？',
        ],
      },
      notes: '偏远地区建议准备卫星通信',
    },
    {
      id: 'rule.emergency.insurance',
      category: 'health_insurance',
      severity: 'high',
      when: {
        all: [
          {
            any: [
              {
                geoPath: 'geo.mountains.mountainElevationAvg',
                operator: 'gte',
                value: 3000,
              },
              {
                geoPath: 'geo.roads.roadDensityScore',
                operator: 'lt',
                value: 0.2,
              },
            ],
          },
        ],
      },
      then: {
        level: 'must',
        message: '高海拔或偏远地区必须购买包含救援和医疗的保险，确保覆盖直升机救援等高成本项目。',
        tasks: [
          {
            title: '购买包含救援和医疗的保险',
            dueOffsetDays: -14,
            tags: ['insurance', 'health'],
          },
          {
            title: '确认保险覆盖直升机救援',
            dueOffsetDays: -7,
            tags: ['insurance', 'rescue'],
          },
          {
            title: '确认保险覆盖高海拔医疗',
            dueOffsetDays: -7,
            tags: ['insurance', 'altitude'],
          },
        ],
        askUser: [
          '保险是否包含救援和医疗？',
          '保险是否覆盖直升机救援？',
          '保险是否覆盖高海拔医疗？',
        ],
      },
      notes: '高海拔/偏远地区必须购买救援保险',
    },
    {
      id: 'rule.emergency.police',
      category: 'safety_hazards',
      severity: 'medium',
      when: {
        all: [
          {
            geoPath: 'geo.pois.safety.hasPolice',
            operator: 'eq',
            value: false,
          },
          {
            geoPath: 'geo.roads.roadDensityScore',
            operator: 'lt',
            value: 0.3,
          },
        ],
      },
      then: {
        level: 'should',
        message: '偏远地区且附近无警局。建议了解最近警局位置，并准备应急联系方式。',
        tasks: [
          {
            title: '查询最近警局位置',
            dueOffsetDays: -7,
            tags: ['safety', 'police'],
          },
          {
            title: '保存当地报警电话',
            dueOffsetDays: -3,
            tags: ['safety', 'emergency'],
          },
        ],
        askUser: [
          '是否已了解最近警局位置？',
          '是否已保存报警电话？',
        ],
      },
      notes: '偏远地区建议了解警局位置',
    },
  ],
};

