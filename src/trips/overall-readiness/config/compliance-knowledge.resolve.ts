/**
 * 按目的地解析 COMPLIANCE_KNOWLEDGE Pack — 禁止非 IS 回退冰岛结构。
 */

import { CHINA_COMPLIANCE_KNOWLEDGE_PACK } from './china-compliance-knowledge.pack';
import { GENERIC_SELF_DRIVE_COMPLIANCE_KNOWLEDGE_PACK } from './generic-self-drive-compliance-knowledge.pack';
import {
  ICELAND_COMPLIANCE_KNOWLEDGE_PACK,
  type ComplianceKnowledgePackItem,
} from './iceland-compliance-knowledge.pack';

export type { ComplianceKnowledgePackItem };

export function resolveCompliancePack(
  countryCode: string | null | undefined,
): ComplianceKnowledgePackItem[] {
  const code = (countryCode ?? '').trim().toUpperCase();
  if (code === 'IS') return ICELAND_COMPLIANCE_KNOWLEDGE_PACK;
  if (code === 'CN') return CHINA_COMPLIANCE_KNOWLEDGE_PACK;
  return GENERIC_SELF_DRIVE_COMPLIANCE_KNOWLEDGE_PACK;
}

export function complianceCategoryDescriptionZh(
  countryCode: string | null | undefined,
): string {
  const code = (countryCode ?? '').trim().toUpperCase();
  if (code === 'IS') return '冰岛交通规则、当地法规等';
  if (code === 'CN') return '中国限行、ETC、高原与预约等自驾合规要点';
  return '目的地交通规则与当地驾驶合规要点';
}

export function complianceCategoryTipZh(
  countryCode: string | null | undefined,
): { style: 'TIP' | 'WARNING'; textZh: string } {
  const code = (countryCode ?? '').trim().toUpperCase();
  if (code === 'IS') {
    return {
      style: 'WARNING',
      textZh: '冰岛严禁离开道路越野驾驶，违规可能面临高额罚款',
    };
  }
  if (code === 'CN') {
    return {
      style: 'WARNING',
      textZh: '进城前核验限行与 ETC；涉藏/川西行程须安排高反适应并预留缓冲日',
    };
  }
  return {
    style: 'TIP',
    textZh: '出发前核验当地限速、酒驾与停车规则，以官方通告为准',
  };
}
