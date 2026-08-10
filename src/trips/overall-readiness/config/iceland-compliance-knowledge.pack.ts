/**
 * 冰岛自驾合规知识 Pack（COMPLIANCE_KNOWLEDGE 最低集合）
 * 解析入口见 compliance-knowledge.resolve.ts（禁止非 IS 回退本 Pack）。
 */

import type { ComplianceKnowledgeItemType } from '../types/self-drive-readiness.types';

export interface ComplianceKnowledgePackItem {
  id: string;
  type: ComplianceKnowledgeItemType;
  titleZh: string;
  contentUrl: string | null;
  iconKey: string;
}

export const ICELAND_COMPLIANCE_KNOWLEDGE_PACK: ComplianceKnowledgePackItem[] = [
  {
    id: 'speed_limit',
    type: 'SPEED_LIMIT',
    titleZh: '冰岛限速',
    contentUrl: null,
    iconKey: 'info',
  },
  {
    id: 'lights_always_on',
    type: 'LIGHTS_ALWAYS_ON',
    titleZh: '全天开灯',
    contentUrl: null,
    iconKey: 'info',
  },
  {
    id: 'no_handheld_phone',
    type: 'NO_HANDHELD_PHONE',
    titleZh: '禁止手持手机',
    contentUrl: null,
    iconKey: 'info',
  },
  {
    id: 'no_offroad',
    type: 'NO_OFFROAD',
    titleZh: '禁止越野驾驶',
    contentUrl: null,
    iconKey: 'info',
  },
  {
    id: 'single_lane_bridge',
    type: 'SINGLE_LANE_BRIDGE',
    titleZh: '单车道桥规则',
    contentUrl: null,
    iconKey: 'info',
  },
  {
    id: 'dui_rule',
    type: 'DUI_RULE',
    titleZh: '酒驾规则 (0.02%)',
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
