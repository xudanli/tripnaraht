/**
 * Resolve soft-auth owner for Iceland Preview / memory-shell APIs.
 * Same rule as createTripShell / proposals: JWT userId OR x-owner-id.
 */

import { UnauthorizedException } from '@nestjs/common';
import type { CurrentUserPayload } from '../../../auth/decorators/current-user.decorator';

export function resolveIcelandShellOwnerId(
  user?: CurrentUserPayload,
  ownerHeader?: string,
): string {
  const id = user?.userId ?? ownerHeader;
  if (!id?.trim()) {
    throw new UnauthorizedException({
      code: 'OWNER_REQUIRED',
      message: 'Authentication or x-owner-id header required',
    });
  }
  return String(id).trim();
}
