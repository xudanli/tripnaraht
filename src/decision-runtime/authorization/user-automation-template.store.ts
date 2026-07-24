/**
 * 用户级自动化授权模板 — 存 UserProfile.preferences.automationAuthorization
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  USER_AUTOMATION_AUTHORIZATION_TEMPLATE_SCHEMA_ID,
  type UserAutomationAuthorizationTemplate,
} from './automation-authorization.types';
import { DEFAULT_AUTOMATION_EXPORT } from '../../trips/trip-constraint-solver/utils/travel-decision-contract.defaults';

export const USER_AUTOMATION_PREFERENCES_KEY = 'automationAuthorization';

@Injectable()
export class UserAutomationTemplateStore {
  constructor(private readonly prisma: PrismaService) {}

  readFromPreferences(preferences: unknown): UserAutomationAuthorizationTemplate | undefined {
    if (!preferences || typeof preferences !== 'object') return undefined;
    const raw = (preferences as Record<string, unknown>)[USER_AUTOMATION_PREFERENCES_KEY];
    if (!raw || typeof raw !== 'object') return undefined;
    return raw as UserAutomationAuthorizationTemplate;
  }

  async get(userId: string): Promise<UserAutomationAuthorizationTemplate | undefined> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { preferences: true },
    });
    return this.readFromPreferences(profile?.preferences);
  }

  async upsert(
    userId: string,
    patch: Omit<UserAutomationAuthorizationTemplate, 'schemaId' | 'updatedAt'>,
  ): Promise<UserAutomationAuthorizationTemplate> {
    const existing = (await this.get(userId)) ?? defaultUserTemplate();
    const next: UserAutomationAuthorizationTemplate = {
      ...existing,
      ...patch,
      schemaId: USER_AUTOMATION_AUTHORIZATION_TEMPLATE_SCHEMA_ID,
      updatedAt: new Date().toISOString(),
      automation: patch.automation
        ? {
            ...(existing.automation ?? DEFAULT_AUTOMATION_EXPORT),
            ...patch.automation,
            actionOverrides: {
              ...(existing.automation?.actionOverrides ?? {}),
              ...(patch.automation.actionOverrides ?? {}),
            },
            executionConditions: {
              ...(existing.automation?.executionConditions ?? {}),
              ...(patch.automation.executionConditions ?? {}),
            },
          }
        : existing.automation,
      changeStrategy: patch.changeStrategy
        ? {
            ...(existing.changeStrategy ?? { archetype: 'BALANCED', tolerances: {} }),
            ...patch.changeStrategy,
            tolerances: {
              ...(existing.changeStrategy?.tolerances ?? {}),
              ...(patch.changeStrategy.tolerances ?? {}),
            },
          }
        : existing.changeStrategy,
    };

    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { preferences: true },
    });
    const preferences = {
      ...((profile?.preferences ?? {}) as Record<string, unknown>),
      [USER_AUTOMATION_PREFERENCES_KEY]: next,
    };

    await this.prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        updatedAt: new Date(),
        preferences: preferences as object,
      },
      update: {
        preferences: preferences as object,
        updatedAt: new Date(),
      },
    });

    return next;
  }

  async reset(userId: string): Promise<UserAutomationAuthorizationTemplate> {
    const next = defaultUserTemplate();
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { preferences: true },
    });
    const preferences = {
      ...((profile?.preferences ?? {}) as Record<string, unknown>),
      [USER_AUTOMATION_PREFERENCES_KEY]: next,
    };

    await this.prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        updatedAt: new Date(),
        preferences: preferences as object,
      },
      update: {
        preferences: preferences as object,
        updatedAt: new Date(),
      },
    });

    return next;
  }
}

function defaultUserTemplate(): UserAutomationAuthorizationTemplate {
  return {
    schemaId: USER_AUTOMATION_AUTHORIZATION_TEMPLATE_SCHEMA_ID,
    updatedAt: new Date().toISOString(),
    automation: { ...DEFAULT_AUTOMATION_EXPORT },
    automationPaused: false,
  };
}
