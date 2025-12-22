// src/trips/readiness/packs/high-altitude.pack.ts

/**
 * High Altitude Pack - 高海拔能力包
 * 
 * 适用于：高海拔地区（海拔 >= 2500m/3000m）或高原国家
 * 输出：高反分级、适应日安排、禁忌、氧气/医院/药房优先插入
 */

import { HighAltitudePackConfig } from '../types/capability-pack.types';

export const highAltitudePack: HighAltitudePackConfig = {
  type: 'high_altitude',
  displayName: 'High Altitude Travel Readiness',
  trigger: {
    all: [
      {
        geoPath: 'geo.mountains.mountainElevationAvg',
        operator: 'gte',
        value: 2500, // 默认 2500m，可根据地区调整
      },
    ],
  },
  metadata: {
    description: '适用于海拔 2500m 以上的高海拔地区',
    priority: 1,
  },
  hazards: [
    {
      type: 'altitude_sickness',
      severity: 'high',
      summary: '高海拔可能导致急性高山病（AMS）、高原肺水肿（HAPE）、高原脑水肿（HACE）',
      mitigations: [
        '逐步适应海拔，避免快速上升',
        '保持充足水分，避免饮酒和过度运动',
        '携带氧气瓶或选择有供氧设施的住宿',
        '了解高反症状，及时下撤',
      ],
    },
  ],
  rules: [
    {
      id: 'rule.altitude.grading',
      category: 'health_insurance',
      severity: 'high',
      when: {
        all: [
          {
            geoPath: 'geo.mountains.mountainElevationAvg',
            operator: 'gte',
            value: 3000,
          },
        ],
      },
      then: {
        level: 'must',
        message: '海拔超过 3000m，属于高海拔地区。建议进行高反风险评估，并准备适应计划。',
        tasks: [
          {
            title: '评估高反风险（个人病史、年龄、身体状况）',
            dueOffsetDays: -30,
            tags: ['health', 'altitude'],
          },
          {
            title: '规划海拔适应日（每 500-1000m 停留 1-2 天）',
            dueOffsetDays: -14,
            tags: ['planning', 'altitude'],
          },
          {
            title: '准备高反药物（如乙酰唑胺）',
            dueOffsetDays: -7,
            tags: ['health', 'medication'],
          },
        ],
        askUser: [
          '是否有高反病史？',
          '是否有心血管疾病？',
          '是否已规划海拔适应日？',
        ],
      },
      notes: '基于海拔高度自动触发',
    },
    {
      id: 'rule.altitude.oxygen',
      category: 'gear_packing',
      severity: 'medium',
      when: {
        all: [
          {
            geoPath: 'geo.mountains.mountainElevationAvg',
            operator: 'gte',
            value: 4000,
          },
        ],
      },
      then: {
        level: 'should',
        message: '海拔超过 4000m，建议携带便携式氧气瓶或选择有供氧设施的住宿。',
        tasks: [
          {
            title: '准备便携式氧气瓶',
            dueOffsetDays: -7,
            tags: ['gear', 'oxygen'],
          },
          {
            title: '确认住宿是否有供氧设施',
            dueOffsetDays: -3,
            tags: ['accommodation', 'oxygen'],
          },
        ],
        askUser: [
          '是否已准备氧气设备？',
          '住宿是否有供氧设施？',
        ],
      },
      notes: '极高海拔（>4000m）建议携带氧气',
    },
    {
      id: 'rule.altitude.medical',
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
            geoPath: 'geo.mountains.mountainElevationAvg',
            operator: 'gte',
            value: 3000,
          },
        ],
      },
      then: {
        level: 'must',
        message: '高海拔地区且附近无医院。必须购买包含高海拔医疗救援的保险，并了解最近医疗点位置。',
        tasks: [
          {
            title: '购买包含高海拔医疗救援的保险',
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
          '保险是否覆盖高海拔医疗救援？',
          '是否已了解最近医疗点位置？',
        ],
      },
      notes: '高海拔 + 无医院 = 高风险',
    },
    {
      id: 'rule.altitude.contraindications',
      category: 'health_insurance',
      severity: 'high',
      appliesTo: {
        travelerTags: ['preexisting_conditions'],
      },
      when: {
        all: [
          {
            geoPath: 'geo.mountains.mountainElevationAvg',
            operator: 'gte',
            value: 3000,
          },
        ],
      },
      then: {
        level: 'blocker',
        message: '高海拔地区对某些疾病有禁忌。建议咨询医生，确认是否适合高海拔旅行。',
        tasks: [
          {
            title: '咨询医生，评估高海拔旅行风险',
            dueOffsetDays: -30,
            tags: ['health', 'medical'],
          },
          {
            title: '准备医疗证明和药物',
            dueOffsetDays: -14,
            tags: ['health', 'medication'],
          },
        ],
        askUser: [
          '是否已咨询医生？',
          '医生是否批准高海拔旅行？',
          '是否有心血管疾病、呼吸系统疾病？',
        ],
      },
      notes: '有基础疾病者需特别谨慎',
    },
  ],
};

