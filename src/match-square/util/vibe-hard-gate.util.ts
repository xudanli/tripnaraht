import type { VerifiedCredentialsBundle } from '../../odyssey-intake/types/verified-credentials.types';
import type { EducationDegreeLevel } from '../../odyssey-intake/types/verified-credentials.types';
import type { VibeEducationBaseline, VibeHardGates, VibeLlmParsePayload } from '../types/vibe-llm.types';

const DEGREE_RANK: Record<EducationDegreeLevel, number> = {
  bachelor: 1,
  master: 2,
  doctor: 3,
};

const BASELINE_RANK: Record<Exclude<VibeEducationBaseline, 'None'>, number> = {
  Bachelor: 1,
  Master: 2,
  Doctor: 3,
};

function meetsEducationBaseline(
  baseline: VibeEducationBaseline | undefined,
  credentials: VerifiedCredentialsBundle | null | undefined,
): boolean {
  if (!baseline || baseline === 'None') return true;
  const required = BASELINE_RANK[baseline];
  const degree = credentials?.education?.verified ? credentials.education.degreeLevel : null;
  if (!degree) return false;
  return DEGREE_RANK[degree] >= required;
}

function meetsSecurityLevel(
  level: VibeHardGates['security_level'] | undefined,
  credentials: VerifiedCredentialsBundle | null | undefined,
): boolean {
  if (!level || level === 'Standard' || level === 'Medium') return true;
  const eduOk = credentials?.education?.verified === true;
  const profOk = credentials?.profession?.verified === true;
  return eduOk || profOk;
}

export function evaluateVibeHardGates(
  payload: VibeLlmParsePayload | null,
  credentials: VerifiedCredentialsBundle | null | undefined,
): { blocked: boolean; reason: string | null } {
  if (!payload?.hard_gates) return { blocked: false, reason: null };

  const { hard_gates: gates } = payload;

  if (!meetsEducationBaseline(gates.education_baseline, credentials)) {
    const label =
      gates.education_baseline === 'Doctor'
        ? '博士'
        : gates.education_baseline === 'Master'
          ? '硕士'
          : '本科';
    return {
      blocked: true,
      reason: `该招募由 AI 设置了「${label}及以上」学历门槛，需完成学信网学历认证后方可申请。`,
    };
  }

  if (!meetsSecurityLevel(gates.security_level, credentials)) {
    return {
      blocked: true,
      reason:
        '该招募启用了「职层高授信」风控：需至少完成学历或企业邮箱认证后方可申请。',
    };
  }

  return { blocked: false, reason: null };
}

export function summarizeVibeHardGates(gates: VibeHardGates | undefined): string[] {
  if (!gates) return [];
  const lines: string[] = [];
  if (gates.budget_range) {
    lines.push(`预算范围：${gates.budget_range}`);
  }
  if (gates.education_baseline && gates.education_baseline !== 'None') {
    lines.push(`学历门槛：${gates.education_baseline} 及以上`);
  }
  if (gates.security_level === 'High') {
    lines.push('授信等级：High（需身份认证）');
  } else if (gates.security_level === 'Medium') {
    lines.push('授信等级：Medium（轻度背书）');
  }
  if (gates.industry_preference?.length) {
    lines.push(`圈层偏好：${gates.industry_preference.join('、')}`);
  }
  return lines;
}
