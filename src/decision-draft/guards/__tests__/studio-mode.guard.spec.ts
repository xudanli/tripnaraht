// src/decision-draft/guards/__tests__/studio-mode.guard.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { StudioModeGuard, RequireStudio } from '../studio-mode.guard';
import { Reflector } from '@nestjs/core';

describe('StudioModeGuard', () => {
  let guard: StudioModeGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StudioModeGuard, Reflector],
    }).compile();

    guard = module.get<StudioModeGuard>(StudioModeGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  it('应该被定义', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('如果没有标记 RequireStudio，应该允许通过', () => {
      const context = createMockContext({ user: null });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('如果用户有 Studio 权限，应该允许通过', () => {
      const context = createMockContext({
        user: { id: 'user-1', roles: ['studio'] },
        requireStudio: true,
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('如果用户有 Admin 权限，应该允许通过', () => {
      const context = createMockContext({
        user: { id: 'user-1', roles: ['admin'] },
        requireStudio: true,
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('如果用户没有权限，应该抛出 ForbiddenException', () => {
      const context = createMockContext({
        user: { id: 'user-1', roles: ['user'] },
        requireStudio: true,
      });
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('如果用户未认证，应该抛出 ForbiddenException', () => {
      const context = createMockContext({
        user: null,
        requireStudio: true,
      });
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  function createMockContext(options: {
    user?: any;
    requireStudio?: boolean;
  }): ExecutionContext {
    const request = {
      user: options.user,
    };

    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as ExecutionContext;

    // Mock Reflector
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(options.requireStudio || false);

    return context;
  }
});
