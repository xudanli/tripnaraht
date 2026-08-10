/**
 * 通用自驾合规知识 Pack（非 IS / 非 CN）
 * 仅保留跨市场通用项，禁止回退冰岛 F-road / 单车道桥等特异规则。
 */

import type { ComplianceKnowledgePackItem } from './iceland-compliance-knowledge.pack';

export const GENERIC_SELF_DRIVE_COMPLIANCE_KNOWLEDGE_PACK: ComplianceKnowledgePackItem[] =
  [
    {
      id: 'speed_limit',
      type: 'SPEED_LIMIT',
      titleZh: '当地限速规则',
      contentUrl: null,
      iconKey: 'info',
    },
    {
      id: 'no_handheld_phone',
      type: 'NO_HANDHELD_PHONE',
      titleZh: '禁止手持手机驾驶',
      contentUrl: null,
      iconKey: 'info',
    },
    {
      id: 'dui_rule',
      type: 'DUI_RULE',
      titleZh: '酒驾规则',
      contentUrl: null,
      iconKey: 'info',
    },
    {
      id: 'roadside_parking',
      type: 'ROADSIDE_PARKING',
      titleZh: '路边停车规则',
      contentUrl: null,
      iconKey: 'info',
    },
    {
      id: 'accident_handling',
      type: 'ACCIDENT_HANDLING',
      titleZh: '事故处理方式',
      contentUrl: null,
      iconKey: 'info',
    },
  ];
