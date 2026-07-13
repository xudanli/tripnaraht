/**
 * ExecutabilityAssessment → 用户可见 BFF 投影
 * @see internal-docs/product/TEP-SELF-DRIVE-PHASE0-ENGINEERING-CONTRACT.md 附录 E
 */

import type {
  ExecutabilityAssessment,
  ExecutabilityAssessmentUi,
  ExecutabilityStatus,
} from '../contracts/tep-self-drive.types';

const STATUS_UI: Record<
  ExecutabilityStatus,
  Omit<ExecutabilityAssessmentUi, 'status'>
> = {
  EXECUTABLE: {
    statusLabel: '可以出发',
    stripLevel: 'success',
    canCommit: true,
    primaryCta: { label: '确认行程', deepLink: 'action=commit-plan' },
  },
  EXECUTABLE_WITH_CAUTION: {
    statusLabel: '可以出发，但有注意事项',
    stripLevel: 'warning',
    canCommit: true,
    primaryCta: { label: '查看注意事项', deepLink: 'tab=decisions' },
  },
  REQUIRES_CONFIRMATION: {
    statusLabel: '需要你确认几项再出发',
    stripLevel: 'warning',
    canCommit: false,
    primaryCta: { label: '去确认', deepLink: 'tab=decisions&filter=confirm' },
  },
  REQUIRES_REPAIR: {
    statusLabel: '需要调整后才能出发',
    stripLevel: 'danger',
    canCommit: false,
    primaryCta: { label: '查看调整建议', deepLink: 'tab=decisions&filter=repair' },
  },
  NOT_EXECUTABLE: {
    statusLabel: '当前计划无法执行',
    stripLevel: 'danger',
    canCommit: false,
    primaryCta: { label: '查看原因', deepLink: 'tab=decisions&filter=block' },
  },
  UNKNOWN: {
    statusLabel: '部分信息待更新，暂无法确认',
    stripLevel: 'neutral',
    canCommit: false,
    primaryCta: { label: '刷新信息', deepLink: 'action=refresh-evidence' },
  },
};

export function projectExecutabilityAssessmentUi(
  assessment: Pick<ExecutabilityAssessment, 'status'>,
): ExecutabilityAssessmentUi {
  const base = STATUS_UI[assessment.status];
  return {
    status: assessment.status,
    ...base,
  };
}
