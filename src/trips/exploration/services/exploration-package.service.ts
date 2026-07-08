import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  EXPLORATION_PACKAGE_CATALOG,
  type ExplorationPackageId,
} from '../config/exploration-packages.catalog';
import { resolveResearchProtocol } from '../config/exploration-protocol.registry';
import { orderPackagesForSession } from '../utils/latin-square-order.util';
import { ExplorationScenarioService } from './exploration-scenario.service';

export interface ExplorationPackageCardView {
  packageId: string;
  displayOrder: number;
  title: string;
  subtitle: string;
  description: string;
  valueProps: string[];
}

@Injectable()
export class ExplorationPackageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scenarios: ExplorationScenarioService,
  ) {}

  async getPackagePresentation(
    userId: string,
    scenarioId: string,
  ): Promise<{
    sessionId: string;
    presentationOrder: string[];
    packages: ExplorationPackageCardView[];
    presentationMode: string;
  }> {
    const scenario = await this.scenarios.assertMaterialized(userId, scenarioId);
    const session = await this.requireSession(scenarioId);
    const protocol = resolveResearchProtocol(session.protocolId);
    const policy = protocol?.packagePresentationPolicy ?? {
      mode: 'LATIN_SQUARE' as const,
      packageIds: Object.keys(EXPLORATION_PACKAGE_CATALOG),
    };

    const presentationOrder = orderPackagesForSession(
      policy.packageIds,
      session.id,
      policy.mode,
    );

    const packages = presentationOrder.map((packageId, index) => {
      const def = EXPLORATION_PACKAGE_CATALOG[packageId as ExplorationPackageId];
      return {
        packageId,
        displayOrder: index + 1,
        title: def?.title ?? packageId,
        subtitle: def?.subtitle ?? '',
        description: def?.description ?? '',
        valueProps: def?.valueProps ?? [],
      };
    });

    return {
      sessionId: session.id,
      presentationOrder,
      packages,
      presentationMode: policy.mode,
    };
  }

  async submitPackageFeedback(
    userId: string,
    scenarioId: string,
    body: {
      packageRankings: string[];
      valueScores: Record<string, number>;
      trustScores: Record<string, number>;
      acceptablePriceUsd?: { min?: number; max?: number; currency?: string };
      leastPreferredPackageId?: string;
      preferredPackageId?: string;
    },
  ) {
    const session = await this.requireSessionForUser(userId, scenarioId);
    const presentation = await this.getPackagePresentation(userId, scenarioId);

    const data = {
      presentationOrder: presentation.presentationOrder as unknown as Prisma.InputJsonValue,
      packageRankings: body.packageRankings as unknown as Prisma.InputJsonValue,
      valueScores: body.valueScores as unknown as Prisma.InputJsonValue,
      trustScores: body.trustScores as unknown as Prisma.InputJsonValue,
      acceptablePriceUsd: body.acceptablePriceUsd as unknown as Prisma.InputJsonValue,
      leastPreferredPackageId: body.leastPreferredPackageId ?? null,
      preferredPackageId: body.preferredPackageId ?? body.packageRankings[0] ?? null,
    };

    const feedback = await this.prisma.productDiscoveryPackageFeedback.upsert({
      where: { sessionId: session.id },
      create: { sessionId: session.id, ...data },
      update: data,
    });

    await this.prisma.productDiscoverySession.update({
      where: { id: session.id },
      data: {
        metadata: {
          ...((session.metadata as object) ?? {}),
          packageFeedbackSubmitted: true,
          preferredPackageId: feedback.preferredPackageId,
        } as Prisma.InputJsonValue,
      },
    });

    return {
      sessionId: session.id,
      preferredPackageId: feedback.preferredPackageId,
      saved: true,
    };
  }

  private async requireSession(scenarioId: string) {
    const session = await this.prisma.productDiscoverySession.findUnique({
      where: { scenarioId },
    });
    if (!session) {
      throw new NotFoundException(`Research session for scenario ${scenarioId} not found`);
    }
    return session;
  }

  private async requireSessionForUser(userId: string, scenarioId: string) {
    const session = await this.requireSession(scenarioId);
    if (session.userId !== userId) {
      throw new NotFoundException(`Research session for scenario ${scenarioId} not found`);
    }
    return session;
  }
}
