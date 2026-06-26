import { ForbiddenException } from '@nestjs/common';
import { PublishingPermissionService } from '../../identity-governance/services/publishing-permission.service';
import {
  MATCH_SQUARE_FROZEN_CODE,
  MATCH_SQUARE_FROZEN_MESSAGE,
} from '../../identity-governance/constants/identity-governance.constants';

export type MatchSquareAccessFlags = {
  canBrowse: boolean;
  canPost: boolean;
  canApply: boolean;
  quizComplete: boolean;
  frozen: boolean;
  frozenReason?: string;
};

/** 搭子广场写操作与公开招募已下线 — 保留只读接口供历史数据 */
export function assertMatchSquareLegacyWritesFrozen(): never {
  throw new ForbiddenException({
    code: MATCH_SQUARE_FROZEN_CODE,
    message: MATCH_SQUARE_FROZEN_MESSAGE,
  });
}

export async function resolveMatchSquareAccess(
  _publishingPermission: PublishingPermissionService,
  userId: string | undefined,
  quizComplete: boolean,
): Promise<MatchSquareAccessFlags> {
  void _publishingPermission;
  void userId;

  return {
    canBrowse: true,
    canPost: false,
    canApply: false,
    quizComplete,
    frozen: true,
    frozenReason: MATCH_SQUARE_FROZEN_MESSAGE,
  };
}

export async function assertMatchSquarePublicAction(
  _publishingPermission: PublishingPermissionService,
  _userId: string,
): Promise<void> {
  void _publishingPermission;
  void _userId;
  assertMatchSquareLegacyWritesFrozen();
}

export function assertMatchSquareNotFrozen(_access: MatchSquareAccessFlags): void {
  void _access;
  assertMatchSquareLegacyWritesFrozen();
}
