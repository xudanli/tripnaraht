/**
 * 中国自驾合规知识 Pack（COMPLIANCE_KNOWLEDGE）
 * 对齐 Country Pack：限行/ETC/高原/检查站/分时预约；非冰岛 F-road 规则。
 */

import type { ComplianceKnowledgePackItem } from './iceland-compliance-knowledge.pack';

/** Country Pack 内合规文案（客户端可按 pack:// 解析为仓库相对路径） */
const CN_COMPLIANCE = (file: string) =>
  `pack://country-packs/CN/compliance/${file}`;

export const CHINA_COMPLIANCE_KNOWLEDGE_PACK: ComplianceKnowledgePackItem[] = [
  {
    id: 'city_driving_limit',
    type: 'CITY_DRIVING_LIMIT',
    titleZh: '城市限行与外牌',
    contentUrl: CN_COMPLIANCE('city-driving-limit.v1.md'),
    iconKey: 'info',
  },
  {
    id: 'etc_expressway',
    type: 'ETC_EXPRESSWAY',
    titleZh: '高速公路 ETC',
    contentUrl: CN_COMPLIANCE('etc-expressway.v1.md'),
    iconKey: 'info',
  },
  {
    id: 'speed_limit',
    type: 'SPEED_LIMIT',
    titleZh: '限速与区间测速',
    contentUrl: CN_COMPLIANCE('speed-limit.v1.md'),
    iconKey: 'info',
  },
  {
    id: 'no_handheld_phone',
    type: 'NO_HANDHELD_PHONE',
    titleZh: '禁止手持手机驾驶',
    contentUrl: CN_COMPLIANCE('no-handheld-phone.v1.md'),
    iconKey: 'info',
  },
  {
    id: 'dui_rule',
    type: 'DUI_RULE',
    titleZh: '酒驾与醉驾规则',
    contentUrl: CN_COMPLIANCE('dui-rule.v1.md'),
    iconKey: 'info',
  },
  {
    id: 'high_altitude_pace',
    type: 'HIGH_ALTITUDE_PACE',
    titleZh: '高原控程与适应',
    contentUrl: CN_COMPLIANCE('high-altitude-pace.v1.md'),
    iconKey: 'info',
  },
  {
    id: 'checkpoint_documents',
    type: 'CHECKPOINT_DOCUMENTS',
    titleZh: '涉藏检查站与证件',
    contentUrl: CN_COMPLIANCE('checkpoint-documents.v1.md'),
    iconKey: 'info',
  },
  {
    id: 'timed_entry_booking',
    type: 'TIMED_ENTRY_BOOKING',
    titleZh: '热门景区分时预约',
    contentUrl: CN_COMPLIANCE('timed-entry-booking.v1.md'),
    iconKey: 'info',
  },
  {
    id: 'accident_handling',
    type: 'ACCIDENT_HANDLING',
    titleZh: '事故与保险报案',
    contentUrl: CN_COMPLIANCE('accident-handling.v1.md'),
    iconKey: 'info',
  },
];
