/**
 * Q8 freeze — CTA + role matrix
 * evidence/work-packages/NARA-LOOK-P0/s0-contracts/CTA_AND_ROLES.md
 */

import type { AssessmentStatus } from './observation.types';

export type LookTripRole = 'ORGANIZER' | 'DRIVER' | 'MEMBER' | 'ADVISOR';

export interface LookRoleCapabilities {
  capture: boolean;
  viewResult: boolean;
  viewPlans: boolean;
  confirmApply: boolean | 'conditional';
}

export const LOOK_ROLE_MATRIX: Record<LookTripRole, LookRoleCapabilities> = {
  ORGANIZER: {
    capture: true,
    viewResult: true,
    viewPlans: true,
    confirmApply: true,
  },
  DRIVER: {
    capture: true,
    viewResult: true,
    viewPlans: true,
    confirmApply: 'conditional',
  },
  MEMBER: {
    capture: true,
    viewResult: true,
    viewPlans: true,
    confirmApply: false,
  },
  ADVISOR: {
    capture: false,
    viewResult: true,
    viewPlans: true,
    confirmApply: false,
  },
};

export interface DriverApplyGateInput {
  role: LookTripRole;
  canConfirmExecutionChange: boolean;
  isActivelyDriving: boolean;
  proposalBlocked: boolean;
  previewConfirmsWriteAuthority: boolean;
}

/** Q8.2 — Driver Apply is never role-name-only */
export function canConfirmApply(input: DriverApplyGateInput): boolean {
  const caps = LOOK_ROLE_MATRIX[input.role];
  if (caps.confirmApply === false) return false;
  if (caps.confirmApply === true) {
    return (
      !input.isActivelyDriving &&
      !input.proposalBlocked &&
      input.previewConfirmsWriteAuthority
    );
  }
  // DRIVER conditional
  return (
    input.canConfirmExecutionChange &&
    !input.isActivelyDriving &&
    !input.proposalBlocked &&
    input.previewConfirmsWriteAuthority
  );
}

export function canCapture(role: LookTripRole): boolean {
  return LOOK_ROLE_MATRIX[role].capture;
}

export interface CtaPair {
  zh: { primary: string; secondary: string };
  en: { primary: string; secondary: string };
}

export const ASSESSMENT_CTA: Record<
  AssessmentStatus | 'CONFLICTING' | 'NO_GPS' | 'RETRY',
  CtaPair
> = {
  INFO: {
    zh: { primary: '返回今日行程', secondary: '查看识别依据' },
    en: { primary: 'Back to Today', secondary: 'View evidence' },
  },
  NOTICE: {
    zh: { primary: '我知道了', secondary: '查看影响' },
    en: { primary: 'Got it', secondary: 'View impact' },
  },
  NEED_CONFIRM: {
    zh: { primary: '查看详情', secondary: '稍后处理' },
    en: { primary: 'Review details', secondary: 'Decide later' },
  },
  SUGGEST_REPLACE: {
    zh: { primary: '查看替代方案', secondary: '保留当前计划' },
    en: { primary: 'View alternatives', secondary: 'Keep current plan' },
  },
  EXECUTION_BLOCK: {
    zh: { primary: '查看安全方案', secondary: '联系求助' },
    en: { primary: 'View safe options', secondary: 'Get help' },
  },
  UNKNOWN: {
    zh: { primary: '补拍照片', secondary: '查看已识别内容' },
    en: { primary: 'Take another photo', secondary: 'View detected details' },
  },
  CONFLICTING: {
    zh: { primary: '查看冲突证据', secondary: '稍后重新检查' },
    en: { primary: 'Review conflicting evidence', secondary: 'Check again later' },
  },
  NO_GPS: {
    zh: { primary: '开启定位后重试', secondary: '仅查看标志说明' },
    en: {
      primary: 'Enable location and retry',
      secondary: 'View sign explanation only',
    },
  },
  RETRY: {
    zh: { primary: '重新分析', secondary: '删除照片' },
    en: { primary: 'Try analysis again', secondary: 'Delete photo' },
  },
};

/** Forbidden EXECUTION_BLOCK dismiss labels (any locale) */
export const EXECUTION_BLOCK_FORBIDDEN_CTA = [
  '继续',
  '忽略',
  '仍然前往',
  '强制执行',
  'Keep current plan',
  'Continue',
  'Ignore',
] as const;

export const DRIVING_SAFETY_COPY = {
  zh: '当前车辆正在移动。请在安全停车后使用 NARA Look，或交由同行成员操作。',
  en: 'The vehicle appears to be moving. Use NARA Look after stopping safely, or ask a passenger to operate it.',
  cta: {
    zh: { primary: '稍后处理', secondary: '由同行成员操作' },
    en: { primary: 'Do this later', secondary: 'Let a passenger continue' },
  },
} as const;
