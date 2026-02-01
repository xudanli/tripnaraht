// src/decision-draft/guards/studio-mode.guard.ts

/**
 * Studio Mode Guard
 * 
 * 权限控制：检查用户是否有 Studio 模式权限
 * Studio 模式需要管理员或 Studio 角色权限
 */

import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

/**
 * 装饰器：标记需要 Studio 权限的接口
 */
export const RequireStudio = Reflector.createDecorator<boolean>();

@Injectable()
export class StudioModeGuard implements CanActivate {
  private readonly logger = new Logger(StudioModeGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // 检查是否标记为需要 Studio 权限
    const requireStudio = this.reflector.getAllAndOverride<boolean>(
      RequireStudio(),
      [context.getHandler(), context.getClass()],
    );

    if (!requireStudio) {
      // 如果没有标记，允许通过（由其他 Guard 控制）
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      this.logger.warn('[StudioModeGuard] 用户未认证');
      throw new ForbiddenException('需要认证才能访问 Studio 模式');
    }

    // 检查用户角色
    // 假设用户对象有 roles 字段（字符串数组）
    const userRoles = user.roles || [];
    const hasStudioPermission =
      userRoles.includes('studio') ||
      userRoles.includes('admin') ||
      userRoles.includes('ops');

    if (!hasStudioPermission) {
      this.logger.warn(
        `[StudioModeGuard] 用户 ${user.id || user.email} 没有 Studio 权限`,
      );
      throw new ForbiddenException('需要 Studio 权限才能访问此功能');
    }

    this.logger.log(
      `[StudioModeGuard] 用户 ${user.id || user.email} 通过 Studio 权限检查`,
    );
    return true;
  }
}
