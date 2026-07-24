/**
 * AI 自动执行授权中心 — BFF 服务
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TripConstraintRegistryService } from '../../trips/trip-constraint-solver/services/trip-constraint-registry.service';
import { TravelStatusService } from '../../trips/travel-status/services/travel-status.service';
import { UserAutomationTemplateStore } from './user-automation-template.store';
import {
  USER_AUTOMATION_AUTHORIZATION_TEMPLATE_SCHEMA_ID,
  type AutomationAuthorizationSaveInput,
  type AutomationAuthorizationScope,
  type UserAutomationAuthorizationTemplate,
} from './automation-authorization.types';
import { readStoredTravelDecisionContract } from '../../trips/trip-constraint-solver/utils/travel-decision-contract.builder';
import { projectAutomationCatalogSummary } from '../../trips/travel-status/utils/automation-catalog-summary.projection.util';
import { resolveAutomationPolicyFromTripMetadata } from '../../trips/trip-constraint-solver/utils/travel-decision-contract-runtime.util';
import type { TravelDecisionContract } from '../../trips/trip-constraint-solver/types/travel-decision-contract.types';
import type { TravelStatusView } from '../../trips/travel-status/types/travel-status.types';

export const AUTOMATION_AUTHORIZATION_VIEW_SCHEMA_ID =
  'tripnara.automation_authorization_view@v1';

export interface AutomationAuthorizationView {
  schemaId: typeof AUTOMATION_AUTHORIZATION_VIEW_SCHEMA_ID;
  tripId: string;
  generatedAt: string;
  scope: AutomationAuthorizationScope;
  constraintsVersion: number;
  automationPaused: boolean;
  contract: TravelDecisionContract;
  travelStatus: Pick<
    TravelStatusView,
    'automation' | 'aiCompletedWork' | 'monitoring' | 'openDecisions'
  >;
  userTemplate?: UserAutomationAuthorizationTemplate;
}

@Injectable()
export class AutomationAuthorizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: TripConstraintRegistryService,
    private readonly travelStatus: TravelStatusService,
    private readonly userTemplateStore: UserAutomationTemplateStore,
  ) {}

  async getView(tripId: string, userId: string): Promise<AutomationAuthorizationView> {
    const [listResult, travelStatus, trip, userTemplate] = await Promise.all([
      this.registry.list(tripId, userId, {}),
      this.travelStatus.getTravelStatus(tripId),
      this.prisma.trip.findUnique({
        where: { id: tripId },
        select: { metadata: true },
      }),
      this.userTemplateStore.get(userId),
    ]);

    if (!trip) {
      throw new NotFoundException(`Trip ${tripId} not found`);
    }

    const stored = readStoredTravelDecisionContract(
      (trip.metadata ?? {}) as Record<string, unknown>,
    );

    return {
      schemaId: AUTOMATION_AUTHORIZATION_VIEW_SCHEMA_ID,
      tripId,
      generatedAt: new Date().toISOString(),
      scope: stored?.automationScope ?? 'TRIP',
      constraintsVersion: listResult.meta.constraintsVersion,
      automationPaused: stored?.automationPaused === true,
      contract: listResult.contract,
      travelStatus: {
        automation: travelStatus.automation,
        aiCompletedWork: travelStatus.aiCompletedWork,
        monitoring: travelStatus.monitoring,
        openDecisions: travelStatus.openDecisions,
      },
      userTemplate,
    };
  }

  async save(
    tripId: string,
    userId: string,
    input: AutomationAuthorizationSaveInput,
  ): Promise<AutomationAuthorizationView> {
    if (input.resetToDefaults && input.scope === 'USER_TEMPLATE') {
      await this.userTemplateStore.reset(userId);
    } else if (input.scope === 'USER_TEMPLATE') {
      await this.userTemplateStore.upsert(userId, {
        automationPaused: input.automationPaused,
        automation: input.automation as UserAutomationAuthorizationTemplate['automation'],
        changeStrategy: input.changeStrategy as UserAutomationAuthorizationTemplate['changeStrategy'],
        teamGovernance: input.teamGovernance,
      });
    }

    let automationPatch = input.automation;
    let changeStrategyPatch = input.changeStrategy;
    let teamGovernancePatch = input.teamGovernance;
    let automationPaused = input.automationPaused;

    if (input.scope === 'USER_TEMPLATE') {
      const template = await this.userTemplateStore.get(userId);
      if (template) {
        automationPatch = template.automation;
        changeStrategyPatch = template.changeStrategy;
        teamGovernancePatch = template.teamGovernance;
        if (input.automationPaused === undefined) {
          automationPaused = template.automationPaused;
        }
      }
    }

    await this.registry.patchContract(tripId, userId, {
      constraintsVersion: input.constraintsVersion,
      automationPaused,
      automationScope: input.scope,
      resetAutomationToDefaults: input.resetToDefaults,
      automation: automationPatch,
      changeStrategy: changeStrategyPatch,
      teamGovernance: teamGovernancePatch,
    } as never);

    return this.getView(tripId, userId);
  }

  async resetDefaults(tripId: string, userId: string): Promise<AutomationAuthorizationView> {
    return this.save(tripId, userId, {
      scope: 'TRIP',
      resetToDefaults: true,
    });
  }

  async setPaused(
    tripId: string,
    userId: string,
    paused: boolean,
    constraintsVersion?: number,
  ): Promise<AutomationAuthorizationView> {
    await this.registry.patchContract(tripId, userId, {
      constraintsVersion,
      automationPaused: paused,
    } as never);
    return this.getView(tripId, userId);
  }

  async getUserTemplate(userId: string): Promise<UserAutomationAuthorizationTemplate> {
    const template = await this.userTemplateStore.get(userId);
    return (
      template ?? {
        schemaId: USER_AUTOMATION_AUTHORIZATION_TEMPLATE_SCHEMA_ID,
        updatedAt: new Date().toISOString(),
        automation: resolveAutomationPolicyFromTripMetadata({}),
        automationPaused: false,
      }
    );
  }

  async saveUserTemplate(
    userId: string,
    input: Omit<AutomationAuthorizationSaveInput, 'scope' | 'constraintsVersion'>,
  ): Promise<UserAutomationAuthorizationTemplate> {
    if (input.resetToDefaults) {
      return this.userTemplateStore.reset(userId);
    }
    return this.userTemplateStore.upsert(userId, {
      automationPaused: input.automationPaused,
      automation: input.automation as UserAutomationAuthorizationTemplate['automation'],
      changeStrategy: input.changeStrategy as UserAutomationAuthorizationTemplate['changeStrategy'],
      teamGovernance: input.teamGovernance,
    });
  }

  buildCatalogPreview(automation: ReturnType<typeof resolveAutomationPolicyFromTripMetadata>) {
    return projectAutomationCatalogSummary(automation);
  }
}
