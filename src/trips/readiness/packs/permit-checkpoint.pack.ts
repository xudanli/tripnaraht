// src/trips/readiness/packs/permit-checkpoint.pack.ts

/**
 * Permit & Checkpoint Pack - 许可/检查站能力包
 * 
 * 适用于：命中检查站/边境限制关键词、或国家规则
 * 输出：证件/边防证/许可、拍摄限制、路线绕行或降级提示
 */

import { PermitCheckpointPackConfig } from '../types/capability-pack.types';

export const permitCheckpointPack: PermitCheckpointPackConfig = {
  type: 'permit_checkpoint',
  displayName: 'Permit & Checkpoint Readiness',
  trigger: {
    any: [
      {
        geoPath: 'geo.pois.hasCheckpoint',
        operator: 'eq',
        value: true,
      },
      {
        contextPath: 'itinerary.countries',
        operator: 'in',
        value: ['CN', 'RU', 'IN', 'NP', 'BT'], // 需要许可的国家示例
      },
      {
        contextPath: 'itinerary.activities',
        operator: 'containsAny',
        value: ['border_crossing', 'restricted_area', 'military_zone'],
      },
    ],
  },
  metadata: {
    description: '适用于需要许可或检查站的地区',
    priority: 1,
  },
  hazards: [
    {
      type: 'permit_required',
      severity: 'high',
      summary: '某些地区需要特殊许可或边防证，未办理可能导致无法通行',
      mitigations: [
        '提前查询许可要求',
        '准备所需证件和材料',
        '预留办理时间',
        '准备备选路线',
      ],
    },
  ],
  rules: [
    {
      id: 'rule.permit.required',
      category: 'entry_transit',
      severity: 'high',
      when: {
        any: [
          {
            contextPath: 'itinerary.countries',
            operator: 'in',
            value: ['CN', 'RU', 'IN', 'NP', 'BT'],
          },
          {
            contextPath: 'itinerary.activities',
            operator: 'containsAny',
            value: ['border_crossing', 'restricted_area'],
          },
        ],
      },
      then: {
        level: 'must',
        message: '该地区需要特殊许可或边防证。必须提前查询要求并办理，避免无法通行。',
        tasks: [
          {
            title: '查询许可要求和办理流程',
            dueOffsetDays: -30,
            tags: ['permit', 'research'],
          },
          {
            title: '准备所需证件和材料',
            dueOffsetDays: -21,
            tags: ['permit', 'documents'],
          },
          {
            title: '提交许可申请',
            dueOffsetDays: -14,
            tags: ['permit', 'application'],
          },
          {
            title: '确认许可状态（出发前）',
            dueOffsetDays: -3,
            tags: ['permit', 'confirmation'],
          },
        ],
        askUser: [
          '是否已查询许可要求？',
          '是否已提交许可申请？',
          '是否已确认许可状态？',
        ],
      },
      notes: '需要许可的地区必须提前办理',
    },
    {
      id: 'rule.checkpoint.documents',
      category: 'entry_transit',
      severity: 'high',
      when: {
        all: [
          {
            geoPath: 'geo.pois.hasCheckpoint',
            operator: 'eq',
            value: true,
          },
        ],
      },
      then: {
        level: 'must',
        message: '路线包含检查站。必须携带所有证件（护照、签证、许可等），并准备复印件。',
        tasks: [
          {
            title: '准备所有证件（护照、签证、许可等）',
            dueOffsetDays: -7,
            tags: ['documents', 'preparation'],
          },
          {
            title: '准备证件复印件（至少 2 份）',
            dueOffsetDays: -3,
            tags: ['documents', 'backup'],
          },
          {
            title: '确认证件有效期',
            dueOffsetDays: -7,
            tags: ['documents', 'validation'],
          },
        ],
        askUser: [
          '是否已准备所有证件？',
          '是否已准备证件复印件？',
          '证件是否在有效期内？',
        ],
      },
      notes: '检查站需要完整证件',
    },
    {
      id: 'rule.permit.photography',
      category: 'activities_bookings',
      severity: 'medium',
      when: {
        any: [
          {
            contextPath: 'itinerary.activities',
            operator: 'containsAny',
            value: ['photography', 'drone'],
          },
          {
            contextPath: 'itinerary.countries',
            operator: 'in',
            value: ['CN', 'RU', 'IN'],
          },
        ],
      },
      then: {
        level: 'should',
        message: '某些地区对拍摄有限制（如军事区域、边境地区）。建议查询拍摄许可要求，避免违规。',
        tasks: [
          {
            title: '查询拍摄许可要求',
            dueOffsetDays: -14,
            tags: ['permit', 'photography'],
          },
          {
            title: '办理拍摄许可（如需要）',
            dueOffsetDays: -7,
            tags: ['permit', 'photography'],
          },
          {
            title: '了解拍摄限制区域',
            dueOffsetDays: -3,
            tags: ['safety', 'photography'],
          },
        ],
        askUser: [
          '是否已查询拍摄许可要求？',
          '是否已办理拍摄许可？',
          '是否已了解拍摄限制区域？',
        ],
      },
      notes: '某些地区对拍摄有限制',
    },
    {
      id: 'rule.permit.alternative.route',
      category: 'logistics',
      severity: 'medium',
      when: {
        all: [
          {
            contextPath: 'itinerary.activities',
            operator: 'containsAny',
            value: ['restricted_area', 'border_crossing'],
          },
        ],
      },
      then: {
        level: 'should',
        message: '如果无法获得许可，建议准备备选路线，避免行程受阻。',
        tasks: [
          {
            title: '规划备选路线（避免限制区域）',
            dueOffsetDays: -7,
            tags: ['route', 'backup'],
          },
          {
            title: '确认备选路线可行性',
            dueOffsetDays: -3,
            tags: ['route', 'validation'],
          },
        ],
        askUser: [
          '是否已规划备选路线？',
          '备选路线是否可行？',
        ],
      },
      notes: '无法获得许可时需备选路线',
    },
  ],
};

