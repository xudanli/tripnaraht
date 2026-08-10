/**
 * Proactive / Push 产品边界 — 复用既有 Authority，不新建 Proactive 架构。
 */

import type { ComprehensiveNotificationReadinessV1 } from '../../decision-intelligence/proactive-behavior-validation/notification-readiness-comprehensive.util';
import {
  authorizePushDelivery,
} from '../../decision-intelligence/proactive-behavior-validation/notification-readiness-comprehensive.util';
import type { ProactiveAuthorityRegistryV1 } from '../../decision-intelligence/proactive-behavior-validation/proactive-authority.util';

export function assertProductPushPolicy(input: {
  readiness: ComprehensiveNotificationReadinessV1;
  authority: ProactiveAuthorityRegistryV1;
  globalProactive?: boolean;
}): {
  pushAllowed: boolean;
  autoApplyClosed: true;
  autoCancelClosed: true;
  autoRerouteClosed: true;
  reasonsZh: string[];
} {
  const r = authorizePushDelivery({
    readiness: input.readiness,
    authority: input.authority,
    globalProactive: input.globalProactive,
  });
  return {
    pushAllowed: r.allowed,
    autoApplyClosed: true,
    autoCancelClosed: true,
    autoRerouteClosed: true,
    reasonsZh: r.reasonsZh,
  };
}
